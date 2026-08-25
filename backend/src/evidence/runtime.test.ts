import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EvidenceRuntimeConflictError,
  InMemoryEvidenceRuntimeRepository,
} from './runtime.js';

function need() {
  return {
    id: 'need-1',
    dealRoomId: 'room-1',
    needKey: 'need-key-1',
    kind: 'completed-transactions',
    riskClass: 'standard',
    data: { subject: 'seller-1', decision: 'ranking' },
    now: 1_000,
  } as const;
}

test('evidence needs and purchases are idempotent and lifecycle-fenced', async () => {
  const repository = new InMemoryEvidenceRuntimeRepository();
  const firstNeed = await repository.createNeed(need());
  const duplicateNeed = await repository.createNeed({ ...need(), id: 'ignored-need-id' });
  assert.equal(firstNeed.created, true);
  assert.equal(duplicateNeed.created, false);
  assert.equal(duplicateNeed.record.id, 'need-1');

  const purchase = await repository.createPurchase({
    id: 'purchase-1',
    evidenceNeedId: 'need-1',
    idempotencyKey: 'evidence:need-1:provider-1',
    providerId: 'provider-1',
    priceUsdc: '0.02',
    data: { source: 'x402' },
    now: 1_001,
  });
  const duplicatePurchase = await repository.createPurchase({
    ...purchase.record,
    id: 'ignored-purchase-id',
    state: undefined as never,
    version: undefined as never,
    createdAt: undefined as never,
    updatedAt: undefined as never,
  });
  assert.equal(purchase.created, true);
  assert.equal(duplicatePurchase.created, false);

  const submitted = await repository.updatePurchase('purchase-1', 1, 'submitted', { providerTransactionId: 'provider-tx-1', now: 1_002 });
  const unknown = await repository.updatePurchase('purchase-1', submitted.version, 'unknown', { now: 1_003 });
  const reconciling = await repository.updatePurchase('purchase-1', unknown.version, 'reconciling', { now: 1_004 });
  await assert.rejects(
    () => repository.updatePurchase('purchase-1', reconciling.version, 'settled'),
    /SETTLED_REQUIRES_TX_HASH/,
  );
  const settled = await repository.updatePurchase('purchase-1', reconciling.version, 'settled', { txHash: '0xsettled', now: 1_005 });
  assert.equal(settled.state, 'settled');
  assert.equal(settled.txHash, '0xsettled');
  await assert.rejects(() => repository.updatePurchase('purchase-1', settled.version, 'failed'), EvidenceRuntimeConflictError);
  await assert.rejects(() => repository.updatePurchase('purchase-1', 1, 'failed'), EvidenceRuntimeConflictError);
});

test('snapshots are immutable by response hash and qualification blockers recover with OCC', async () => {
  const repository = new InMemoryEvidenceRuntimeRepository();
  await repository.createNeed(need());
  const snapshot = await repository.recordSnapshot({
    id: 'snapshot-1',
    evidenceNeedId: 'need-1',
    source: 'x402',
    capturedAt: 1_010,
    reliability: 82,
    state: 'fresh',
    responseHash: 'sha256:one',
    provenance: ['provider-1', 'provider-tx-1'],
    now: 1_010,
  });
  const duplicate = await repository.recordSnapshot({ ...snapshot.record, id: 'ignored-snapshot-id' });
  assert.equal(snapshot.created, true);
  assert.equal(duplicate.created, false);
  await assert.rejects(() => repository.recordSnapshot({
    ...snapshot.record,
    id: 'different-snapshot',
    reliability: 12,
  }), /duplicate evidence runtime boundary/);

  const blocker = await repository.createBlocker({
    id: 'blocker-1',
    dealRoomId: 'room-1',
    blockerKey: 'stake:room-1:seller-1:v1',
    kind: 'STAKE_SHORTFALL',
    subject: 'seller-1',
    data: { shortfallUsdc: '25' },
    now: 1_020,
  });
  const duplicateBlocker = await repository.createBlocker({ ...blocker.record, id: 'ignored-blocker-id' });
  assert.equal(duplicateBlocker.created, false);
  const resolved = await repository.resolveBlocker('blocker-1', 1, 'resolved', { resolution: 'funded' }, 1_030);
  assert.equal(resolved.state, 'resolved');
  assert.equal(resolved.resolvedAt, 1_030);
  await assert.rejects(() => repository.resolveBlocker('blocker-1', 1, 'cancelled'), /version 1 is stale/);
});
