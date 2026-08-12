import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/// A deposit must be credited once, to the right person, and only when it is
/// really a dollar.
///
/// The flow this covers is the one where a user is told "send USDC from any
/// chain to this address" and nothing on the backend was listening: the Arc
/// balance watcher polls Arc only, so four of the five chains we name had no
/// credit path at all. This is that path, so every branch here is a way to
/// either miss a deposit or invent one.
///
/// Both flat-file stores resolve their path from `process.cwd()`, so the test
/// changes directory before importing anything. That keeps the real store on a
/// developer machine untouched and lets the test drive the REAL wallet lookup
/// and the REAL activity write rather than a stand-in for them.
///
///   npx tsx --test src/circle/depositWatcher.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-deposit-')));
// Flat-file mode. With a connection string these would go to Postgres.
delete process.env.DATABASE_URL;

const { startDepositWatcher, invalidateDepositIndex } = await import('./depositWatcher.js');
const { CCTP_CHAINS } = await import('../chain/cctpChains.js');
const { bus } = await import('../events.js');
const { saveAgentWallets } = await import('../db/agentWallets.js');
const { listActivityForAddress } = await import('../db/activityLog.js');

const OWNER = '0xbef47cb8000000000000000000000000000000aa';
const OTHER = '0xcafe0000000000000000000000000000000000bb';
/// The same address on every EVM chain, because Circle derives deposit wallets
/// from the user's identity anchor. That sameness is the whole reason
/// attribution is keyed on chain AND address.
const DEPOSIT = '0xb8c24f4965d29ae9795dd827fa3c0affc469a9e2';

await saveAgentWallets({
  userAddress: OWNER,
  buyerWalletId: 'w-buyer',
  buyerAddress: '0x1111111111111111111111111111111111111111',
  sellerWalletId: 'w-seller',
  sellerAddress: '0x2222222222222222222222222222222222222222',
  bridgeWallets: {
    'BASE-SEPOLIA': { walletId: 'w-base', address: DEPOSIT },
    'ETH-SEPOLIA': { walletId: 'w-eth', address: DEPOSIT },
  },
});
// The record was written after the watcher's index could have been built.
invalidateDepositIndex();

/// Circle's answer for each tokenId this test uses. Only the network call is
/// stood in for: the address comparison that decides whether a token is a dollar
/// runs for real against the same chain table production reads.
const TOKENS: Record<string, { isNative: boolean; tokenAddress: string; blockchain: string }> = {
  'usdc-base': {
    isNative: false,
    tokenAddress: CCTP_CHAINS.baseSepolia.usdc,
    blockchain: 'BASE-SEPOLIA',
  },
  // Symbol is not part of the check, and this is why: a token can call itself
  // anything. Same chain, same shape, wrong contract.
  'fake-usdc': {
    isNative: false,
    tokenAddress: '0x00000000000000000000000000000000deadbeef',
    blockchain: 'BASE-SEPOLIA',
  },
  // The chain's own gas token, which Circle also reports as an inbound transfer.
  'native-eth': {
    isNative: true,
    tokenAddress: CCTP_CHAINS.baseSepolia.usdc,
    blockchain: 'BASE-SEPOLIA',
  },
};

const stop = startDepositWatcher(async (id) => TOKENS[id] ?? null);

interface Notification {
  id?: string;
  blockchain?: string;
  tokenId?: string;
  transactionType?: string;
  state?: string;
  amounts?: string[];
  destinationAddress?: string;
  txHash?: string;
}

function deposit(over: Notification = {}): Notification {
  return {
    id: 'tx-1',
    blockchain: 'BASE-SEPOLIA',
    tokenId: 'usdc-base',
    transactionType: 'INBOUND',
    state: 'COMPLETE',
    amounts: ['25.5'],
    destinationAddress: DEPOSIT,
    txHash: '0xdead',
    ...over,
  };
}

/// Fire one notification and collect the credits it produced. The handler is
/// async behind a sync bus, so this waits for the microtasks it queues.
async function credits(n: Notification): Promise<Array<Record<string, unknown>>> {
  const seen: Array<Record<string, unknown>> = [];
  const off = bus.subscribe((e) => {
    if (e.type === 'wallet.credited') seen.push(e.payload as Record<string, unknown>);
  });
  bus.emitEvent({
    type: 'circle.webhook',
    actor: 'platform',
    payload: { notification: { transaction: n } },
  });
  // Two turns: one for the lookup, one for the emit that follows it.
  await new Promise((r) => setTimeout(r, 20));
  off();
  return seen;
}

test('credits an inbound USDC deposit to the address owner', async () => {
  const seen = await credits(deposit());
  assert.equal(seen.length, 1);
  const c = seen[0]!;
  assert.equal(c.owner, OWNER);
  // `address` is what proves ownership to the SSE projection. Without it the
  // event reaches the user's own feed with its amount stripped to {}.
  assert.equal(c.address, OWNER);
  assert.equal(c.amountUsdc, '25.5');
  assert.equal(c.chain, 'BASE-SEPOLIA');
  assert.equal(c.source, 'deposit');
  assert.equal(c.txHash, '0xdead');
});

test('writes one activity row the reader can render in their own language', async () => {
  const rows = await listActivityForAddress(OWNER, 0);
  const row = rows.find((r) => r.kind === 'deposit');
  assert.ok(row, 'the credit should leave a history row');
  assert.equal(row.amountUsdc, '25.5');
  // The template name is what lets a non-English reader see this row in their
  // language; the English summary is only the fallback for rows without one.
  const params = row.params as Record<string, string> | undefined;
  assert.equal(params?.t, 'depositCreditedFrom');
  // The chain the money came from. A deposit that says only "Deposited 25.5
  // USDC" reads as a second, separate deposit next to the hop that carries it
  // to Arc, which is how one deposit came to look like two.
  assert.equal(params?.chain, 'Base');
  // Names the hop, so /activity/me can tell that this row and that bridge are
  // the same movement and show only the richer of the two.
  assert.equal(row.refId, 'deposit-tx-1');
});

test('the same transaction redelivered does not credit twice', async () => {
  // Circle sends a transfer again as it advances state, each delivery with its
  // own notificationId, so the receiver's dedupe does not cover this. Keyed on
  // the transaction id instead. Without it a user sees one deposit announced
  // twice and has no way to tell which is real.
  const again = await credits(deposit({ id: 'tx-1', state: 'CONFIRMED' }));
  assert.equal(again.length, 0);
});

test('a deposit to the same address on an unprovisioned chain is not credited', async () => {
  // Circle derives one address across EVM chains, so this notification is
  // indistinguishable from the real one except for the chain. Crediting on
  // address alone would pay the wrong person once two users' indexes collide,
  // which has already happened ten times in this wallet set.
  const seen = await credits(deposit({ id: 'tx-2', blockchain: 'ARB-SEPOLIA' }));
  assert.equal(seen.length, 0);
});

test('a token that is not the real USDC contract is not credited', async () => {
  // Anyone can send any token to a public deposit address, and a token's symbol
  // is whatever its deployer typed. Checking the contract address is what stops
  // a worthless token being announced to the user as a dollar deposit.
  assert.equal((await credits(deposit({ id: 'tx-3', tokenId: 'fake-usdc' }))).length, 0);
  // A token Circle has never heard of resolves to nothing at all.
  assert.equal((await credits(deposit({ id: 'tx-3b', tokenId: 'some-memecoin' }))).length, 0);
  // Native gas arriving at the address is not a deposit either.
  assert.equal((await credits(deposit({ id: 'tx-3c', tokenId: 'native-eth' }))).length, 0);
});

test('outbound and pending transfers are ignored', async () => {
  assert.equal((await credits(deposit({ id: 'tx-4', transactionType: 'OUTBOUND' }))).length, 0);
  assert.equal((await credits(deposit({ id: 'tx-5', state: 'SENT' }))).length, 0);
});

test('a transfer to an address that is not ours is ignored', async () => {
  const seen = await credits(deposit({ id: 'tx-6', destinationAddress: OTHER }));
  assert.equal(seen.length, 0);
});

test('a delivery missing its amount does not suppress the one that carries it', async () => {
  // The dedupe has to come after every check that can still reject, or an early
  // delivery without `amounts` marks the transaction as handled and the real one
  // behind it is dropped. That loses the deposit permanently, silently.
  assert.equal((await credits(deposit({ id: 'tx-7', amounts: [] }))).length, 0);
  const seen = await credits(deposit({ id: 'tx-7' }));
  assert.equal(seen.length, 1, 'the delivery carrying the amount must still credit');
});

test('case does not decide who gets paid', async () => {
  const seen = await credits(
    deposit({ id: 'tx-8', destinationAddress: DEPOSIT.toUpperCase().replace('0X', '0x') }),
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.owner, OWNER);
});

test.after(() => stop());
