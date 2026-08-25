import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryEvidenceRuntimeRepository } from './runtime.js';
import {
  createEvidenceReconciliationWorker,
  reconcileEvidenceOnce,
  type EvidenceReconciliationAdapter,
} from './reconciliation.js';

async function uncertainPurchase() {
  const repository = new InMemoryEvidenceRuntimeRepository();
  await repository.createNeed({
    id: 'need-reconcile',
    dealRoomId: 'room-reconcile',
    needKey: 'need:reconcile',
    kind: 'completed-transactions',
    riskClass: 'standard',
    data: { subject: 'seller-1' },
    now: 100,
  });
  const created = await repository.createPurchase({
    id: 'purchase-reconcile',
    evidenceNeedId: 'need-reconcile',
    idempotencyKey: 'evidence:reconcile:provider-1',
    providerId: 'provider-1',
    priceUsdc: '0.02',
    data: { mode: 'reviewed' },
    now: 101,
  });
  await repository.updatePurchase('purchase-reconcile', created.record.version, 'unknown', { now: 102 });
  return repository;
}

test('evidence reconciliation settles an uncertain purchase once without acquisition authority', async () => {
  const repository = await uncertainPurchase();
  let calls = 0;
  const adapter: EvidenceReconciliationAdapter = {
    async reconcile({ purchase }) {
      calls += 1;
      assert.equal(purchase.id, 'purchase-reconcile');
      return {
        state: 'settled',
        providerTransactionId: 'provider-tx-reconcile',
        txHash: '0xreconcile',
        snapshot: {
          snapshotId: 'snapshot-reconcile',
          source: 'x402',
          capturedAtUnix: 110,
          reliability: 90,
          status: 'fresh',
          responseHash: 'sha256:reconcile',
          provenance: ['provider-tx-reconcile', '0xreconcile'],
        },
      };
    },
  };

  const first = await reconcileEvidenceOnce(repository, adapter, { now: 110 });
  assert.deepEqual(first, {
    scanned: 1,
    polled: 1,
    updated: 1,
    settled: 1,
    failed: 0,
    snapshots: 1,
    skipped: 0,
    errors: [],
  });
  assert.equal(calls, 1);
  assert.equal((await repository.getPurchase('purchase-reconcile'))?.state, 'settled');
  assert.equal((await repository.getNeed('need-reconcile'))?.state, 'fulfilled');
  assert.equal((await repository.listSnapshots('need-reconcile')).length, 1);

  const replay = await reconcileEvidenceOnce(repository, adapter, { now: 111 });
  assert.deepEqual(replay, {
    scanned: 0,
    polled: 0,
    updated: 0,
    settled: 0,
    failed: 0,
    snapshots: 0,
    skipped: 0,
    errors: [],
  });
  assert.equal(calls, 1);
});

test('malformed reconciliation stays uncertain and never fabricates settlement', async () => {
  const repository = await uncertainPurchase();
  const result = await reconcileEvidenceOnce(repository, {
    async reconcile() { return { state: 'settled' }; },
  }, { now: 120 });
  assert.equal(result.polled, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.errors.length, 1);
  assert.equal((await repository.getPurchase('purchase-reconcile'))?.state, 'unknown');
  assert.equal((await repository.getNeed('need-reconcile'))?.state, 'open');
});

test('reconciliation worker coalesces concurrent polls and can be stopped', async () => {
  const repository = await uncertainPurchase();
  let calls = 0;
  const adapter: EvidenceReconciliationAdapter = {
    async reconcile() {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { state: 'unknown' };
    },
  };
  const worker = createEvidenceReconciliationWorker(repository, adapter, { now: () => 130 });
  const first = worker.runOnce();
  const second = worker.runOnce();
  assert.strictEqual(first, second);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  worker.stop();
});
