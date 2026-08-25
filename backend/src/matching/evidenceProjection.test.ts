import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectEvidenceToTransactions,
  projectPaidPassportEvidence,
  projectReputationEvidence,
} from './evidenceProjection.js';

const need = {
  id: 'need-1', dealRoomId: 'room-1', needKey: 'need-key', kind: 'completed-transactions', state: 'open' as const,
  riskClass: 'high', version: 1, createdAt: 100, updatedAt: 100, data: {},
};

test('evidence projection keeps settled paid claims eligible and uncertain claims honest', () => {
  const settled = projectEvidenceToTransactions({
    need,
    nowUnix: 1_005,
    freshnessSeconds: 100,
    snapshots: [{ id: 'snapshot-settled', evidenceNeedId: 'need-1', purchaseId: 'purchase-settled', source: 'x402', capturedAt: 1_000, reliability: 90, state: 'fresh', responseHash: 'hash-1', provenance: ['receipt-1'], createdAt: 1_000 }],
    purchases: [{ id: 'purchase-settled', evidenceNeedId: 'need-1', idempotencyKey: 'purchase-1', providerId: 'provider-1', state: 'settled', priceUsdc: '0.01', txHash: '0xsettled', version: 2, createdAt: 1_000, updatedAt: 1_001, data: { completed: 8, disputed: 1, failed: 0 } }],
  });
  assert.deepEqual(settled[0], {
    source: 'paid_x402', completed: 8, disputed: 1, failed: 0, fetchedAtUnix: 1_000, expiresAtUnix: 1_100,
    paymentStatus: 'SETTLED', verified: true, evidenceId: 'snapshot-settled',
  });

  const unknown = projectEvidenceToTransactions({
    need, nowUnix: 1_005, freshnessSeconds: 100,
    snapshots: [{ id: 'snapshot-unknown', evidenceNeedId: 'need-1', purchaseId: 'purchase-unknown', source: 'x402', capturedAt: 1_000, reliability: 90, state: 'unknown', responseHash: 'hash-2', provenance: ['provider-tx'], createdAt: 1_000 }],
    purchases: [{ id: 'purchase-unknown', evidenceNeedId: 'need-1', idempotencyKey: 'purchase-2', providerId: 'provider-1', state: 'unknown', priceUsdc: '0.01', version: 2, createdAt: 1_000, updatedAt: 1_001, data: { completed: 100, disputed: 0, failed: 0 } }],
  });
  assert.equal(unknown[0]?.verified, false);
  assert.equal(unknown[0]?.paymentStatus, 'UNKNOWN');
  assert.equal(unknown[0]?.completed, 100);
});

test('expired and contradictory snapshots never become verified', () => {
  const projections = projectEvidenceToTransactions({
    need, nowUnix: 2_000, freshnessSeconds: 10,
    snapshots: [
      { id: 'snapshot-expired', evidenceNeedId: 'need-1', source: 'karwan_settled', capturedAt: 1_000, reliability: 100, state: 'fresh', responseHash: 'hash-3', provenance: ['tx-1'], createdAt: 1_000 },
      { id: 'snapshot-contradictory', evidenceNeedId: 'need-1', source: 'onchain', capturedAt: 1_900, reliability: 0, state: 'contradictory', responseHash: 'hash-4', provenance: ['tx-2'], createdAt: 1_900 },
    ],
    purchases: [],
  });
  assert.equal(projections.every((projection) => projection.verified === false), true);
});

test('reputation counts become a stable, expiring on-chain evidence snapshot', () => {
  const first = projectReputationEvidence({
    subjectAddress: ' 0xABC ', completed: 8, disputed: 1, failed: 0, observedAtUnix: 1_000,
  });
  const second = projectReputationEvidence({
    subjectAddress: '0xabc', completed: 8, disputed: 1, failed: 0, observedAtUnix: 1_100,
  });
  assert.deepEqual(first[0], {
    source: 'karwan_onchain', completed: 8, disputed: 1, failed: 0,
    fetchedAtUnix: 1_000, expiresAtUnix: 4_600, verified: true,
    evidenceId: 'reputation:0xabc:8:1:0',
  });
  assert.equal(second[0]?.evidenceId, first[0]?.evidenceId);
  assert.deepEqual(projectReputationEvidence({
    subjectAddress: '0xabc', completed: 0, disputed: 0, failed: 0, observedAtUnix: 1_000,
  }), []);
});

test('paid passport projection preserves counts but remains explicitly uncertain', () => {
  const projected = projectPaidPassportEvidence({
    subjectAddress: ' 0xABC ',
    transaction: 'gateway-batch-7',
    successCount: 8,
    disputedCount: 1,
    failedCount: 0,
    paidAtUnix: 1_000,
  });
  assert.deepEqual(projected[0], {
    source: 'paid_x402',
    completed: 8,
    disputed: 1,
    failed: 0,
    fetchedAtUnix: 1_000,
    expiresAtUnix: 4_600,
    paymentStatus: 'UNKNOWN',
    verified: false,
    evidenceId: 'paid-passport:0xabc:gateway-batch-7',
  });
});

test('paid passport projection can reuse the durable qualification snapshot identity', () => {
  const projected = projectPaidPassportEvidence({
    subjectAddress: '0xabc',
    transaction: 'gateway-batch-7',
    paidAtUnix: 1_000,
    evidenceId: 'legacy-evidence-snapshot:exact',
  });
  assert.equal(projected[0]?.evidenceId, 'legacy-evidence-snapshot:exact');
});

test('malformed paid passport identity does not create evidence', () => {
  assert.deepEqual(projectPaidPassportEvidence({
    subjectAddress: ' ', transaction: 'gateway-batch-7', paidAtUnix: 1_000,
  }), []);
  assert.deepEqual(projectPaidPassportEvidence({
    subjectAddress: '0xabc', transaction: ' ', paidAtUnix: 1_000,
  }), []);
});
