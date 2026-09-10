import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Keep this test's flat-file fallback isolated from the developer's real
// deposit-request store. Postgres uses the same request-state contract plus
// the matched transaction unique index and compare-and-set update.
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-qr-match-')));
delete process.env.DATABASE_URL;

const {
  createDepositRequest,
  getDepositRequest,
  matchDepositRequest,
  saveDepositRequest,
} = await import('./depositRequests.js');

const OWNER = '0x0000000000000000000000000000000000000001';

test('a provider transaction is an idempotent, durable QR request match', async () => {
  const request = createDepositRequest({ owner: OWNER, amountUsdc: '25.50', now: 1_000 });
  await saveDepositRequest(request);

  const matched = await matchDepositRequest({
    owner: OWNER,
    amountUsdc: '25.5',
    txId: 'circle-transfer-1',
    chain: 'Base',
    now: 2_000,
  });
  assert.equal(matched?.token, request.token);
  assert.equal(matched?.matchedTxId, 'circle-transfer-1');

  const replay = await matchDepositRequest({
    owner: OWNER,
    amountUsdc: '25.5',
    txId: 'circle-transfer-1',
    chain: 'Base',
    now: 3_000,
  });
  assert.equal(replay?.token, request.token);
  assert.equal((await getDepositRequest(request.token))?.status, 'matched');
});

test('a transaction already matched to one request cannot be assigned to another', async () => {
  const first = createDepositRequest({ owner: OWNER, amountUsdc: '9', now: 1_000 });
  const second = createDepositRequest({ owner: OWNER, amountUsdc: '9', now: 1_001 });
  await saveDepositRequest(first);
  await saveDepositRequest(second);

  // Ambiguous amount matching stays conservative. Even if one request later
  // owns the transaction, a replay never moves that transaction to the other.
  assert.equal(
    await matchDepositRequest({
      owner: OWNER,
      amountUsdc: '9',
      txId: 'circle-transfer-2',
      chain: 'Base',
      now: 2_000,
    }),
    null,
  );
});
