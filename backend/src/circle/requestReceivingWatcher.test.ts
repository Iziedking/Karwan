import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/// USDC sent to a payment link's own address, from an exchange or any wallet,
/// is counted against that request and moved to the requester on Arc. The
/// requester here signed up with a wallet and has no deposit wallets at all,
/// which is the person this path exists for.
///
///   npx tsx --test src/circle/requestReceivingWatcher.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-reqrecv-')));
delete process.env.DATABASE_URL;
process.env.DEPOSIT_AUTO_BRIDGE_MIN_USDC = '1';

const { startDepositWatcher } = await import('./depositWatcher.js');
const { CCTP_CHAINS } = await import('../chain/cctpChains.js');
const { bus } = await import('../events.js');
const { getBridge } = await import('../db/bridges.js');
const { createDepositRequest, getDepositRequest, saveDepositRequest } = await import('../money/depositRequests.js');
const { invalidateReceivingIndex } = await import('../money/requestReceiving.js');

const REQUESTER = '0x5eed000000000000000000000000000000000042';
const RECEIVING = '0x7777000000000000000000000000000000000007';

const request = createDepositRequest({ owner: REQUESTER, amountUsdc: '120', ttlMinutes: 60 });
await saveDepositRequest({
  ...request,
  receiving: {
    evm: { address: RECEIVING, wallets: { 'BASE-SEPOLIA': 'req-base', 'ETH-SEPOLIA': 'req-eth' } },
    solana: null,
  },
});
invalidateReceivingIndex();

const { listActivityForAddress } = await import('../db/activityLog.js');

const stop = startDepositWatcher(async (tokenId) =>
  tokenId === 'usdt'
    ? { isNative: false, tokenAddress: '0x00000000000000000000000000000000000000d7', blockchain: 'BASE-SEPOLIA', symbol: 'USDT' }
    : { isNative: false, tokenAddress: CCTP_CHAINS.baseSepolia.usdc, blockchain: 'BASE-SEPOLIA' });

async function inbound(id: string, amount: string, tokenId = 'usdc') {
  const seen: Array<Record<string, unknown>> = [];
  const off = bus.subscribe((e) => {
    if (e.type === 'wallet.credited') seen.push(e.payload as Record<string, unknown>);
  });
  bus.emitEvent({
    type: 'circle.webhook',
    actor: 'platform',
    payload: {
      notification: {
        transaction: {
          id,
          blockchain: 'BASE-SEPOLIA',
          tokenId,
          transactionType: 'INBOUND',
          state: 'COMPLETE',
          amounts: [amount],
          destinationAddress: RECEIVING,
          txHash: `0x${id}`,
        },
      },
    },
  });
  await new Promise((r) => setTimeout(r, 80));
  off();
  return seen;
}

test('a part payment is counted, announced to the requester and moved to them', async () => {
  const seen = await inbound('p1', '100');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.address, REQUESTER);
  assert.equal(seen[0]!.requestId, request.token);
  const after = await getDepositRequest(request.token);
  assert.equal(after?.status, 'open');
  assert.equal(after?.receipts?.length, 1);
  const bridge = await getBridge('deposit-p1');
  assert.equal(bridge?.mintRecipient, REQUESTER);
  assert.equal(bridge?.bridgeWalletId, 'req-base');
});

test('the rest pays the request in full', async () => {
  await inbound('p2', '20');
  const after = await getDepositRequest(request.token);
  assert.equal(after?.status, 'matched');
  assert.equal(after?.matchedTxId, 'p2');
});

test('a redelivered transfer is not counted or moved twice', async () => {
  const seen = await inbound('p2', '20');
  assert.equal(seen.length, 0);
  assert.equal((await getDepositRequest(request.token))?.receipts?.length, 2);
});

test('USDT sent to a payment link is not counted, and the requester sees it in history', async () => {
  assert.equal((await inbound('usdt-1', '7', 'usdt')).length, 0);
  assert.equal((await getDepositRequest(request.token))?.receipts?.length, 2);
  const row = (await listActivityForAddress(REQUESTER, 0, 500)).find((r) => r.id === 'wrong-token-usdt-1');
  assert.deepEqual(row?.params, { t: 'wrongToken', amount: '7', token: 'USDT', chain: 'Base' });
  stop();
});
