import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/// The auto-route decides whether to spend a user's money moving their money.
///
/// Every branch here is a way to lose some: bridging the same deposit twice
/// burns funds that are not there the second time, bridging a 20-cent deposit
/// costs more in source-chain gas than it delivers, and bridging to the wrong
/// recipient hands it to someone else.
///
/// The assertion is on the bridge ROW, which is the durable record the pipeline
/// resumes from. The pipeline itself is not exercised: it signs against Circle,
/// and its own resume path is covered where it lives.
///
///   npx tsx --test src/circle/depositRouter.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-router-')));
delete process.env.DATABASE_URL;
process.env.DEPOSIT_AUTO_BRIDGE_MIN_USDC = '1';

const { routeDepositToArc } = await import('./depositRouter.js');
const { saveAgentWallets } = await import('../db/agentWallets.js');
const { getBridge } = await import('../db/bridges.js');

const OWNER = '0xbef47cb8000000000000000000000000000000aa';
const DEPOSIT = '0xb8c24f4965d29ae9795dd827fa3c0affc469a9e2';

await saveAgentWallets({
  userAddress: OWNER,
  buyerWalletId: 'w-buyer',
  buyerAddress: '0x1111111111111111111111111111111111111111',
  sellerWalletId: 'w-seller',
  sellerAddress: '0x2222222222222222222222222222222222222222',
  bridgeWallets: {
    'BASE-SEPOLIA': { walletId: 'w-base', address: DEPOSIT },
    'SOL-DEVNET': { walletId: 'w-sol', address: '7WkaBNxz6jpJWGLPNFNsUbuVH8iQ2FxBooMak6itUMWb' },
  },
});

/// The pipeline is fired but never completes here: there are no Circle
/// credentials, so it errors inside its own loop. The row is what matters.
async function routed(txId: string, over: { amountUsdc?: string; chain?: string } = {}) {
  routeDepositToArc({
    owner: OWNER,
    amountUsdc: over.amountUsdc ?? '25.5',
    chain: over.chain ?? 'BASE-SEPOLIA',
    txId,
  });
  await new Promise((r) => setTimeout(r, 60));
  return getBridge(`deposit-${txId}`);
}

test('routes a deposit to the depositor own Arc address', async () => {
  const b = await routed('tx-1');
  assert.ok(b, 'a bridge row should exist');
  // The mint recipient is the whole point. Anything else pays a stranger.
  assert.equal(b.mintRecipient, OWNER);
  assert.equal(b.amountUsdc, '25.5');
  assert.equal(b.sourceChainKey, 'baseSepolia');
  assert.equal(b.bridgeWalletAddress, DEPOSIT);
});

test('the same deposit is never bridged twice', async () => {
  // Circle redelivers a transaction as its state advances. The bridge id is
  // derived from the transaction id precisely so the second delivery collides
  // with the first row instead of opening a second burn for money that has
  // already left.
  const first = await getBridge('deposit-tx-1');
  await routed('tx-1');
  const after = await getBridge('deposit-tx-1');
  assert.deepEqual(after?.createdAt, first?.createdAt, 'no second row, no second burn');
});

test('a deposit under the floor is left where it is', async () => {
  // Gas to burn on the source chain can exceed the transfer. Small deposits
  // accumulate rather than being spent on their own delivery.
  assert.equal(await routed('tx-2', { amountUsdc: '0.40' }), null);
});

test('the floor is inclusive at exactly the minimum', async () => {
  assert.ok(await routed('tx-3', { amountUsdc: '1' }), 'exactly the floor should route');
});

test('Solana routes through App Kit, not the EVM pipeline', async () => {
  // A Solana burn is an SPL program call with its own accounts and no approve
  // step, so the EVM pipeline cannot carry it. It gets its own leg rather than
  // being dropped.
  const b = await routed('tx-4', { chain: 'SOL-DEVNET' });
  assert.ok(b, 'a Solana deposit should still be routed');
  assert.equal(b.sourceChainKey, 'solanaDevnet');
  // Solana is CCTP domain 5, and it is not in CCTP_CHAINS, which is the EVM
  // table. Reading the domain from there would have thrown.
  assert.equal(b.sourceDomain, 5);
  // Marks the row App-Kit-driven. Without it a restart would feed this back into
  // the EVM source pipeline, which cannot sign it.
  assert.equal(b.appKit, true);
  assert.equal(b.mintRecipient, OWNER);
});

test('a chain with no deposit wallet on record is not routed', async () => {
  assert.equal(await routed('tx-5', { chain: 'ETH-SEPOLIA' }), null);
});

test('an unparseable amount is not routed', async () => {
  assert.equal(await routed('tx-6', { amountUsdc: 'not-a-number' }), null);
});
