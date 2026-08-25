import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaidEvidenceQualificationObservation } from './evidenceQualificationProjection.js';

test('legacy paid passport projection preserves uncertainty and stable identity', () => {
  const data = buildPaidEvidenceQualificationObservation({
    subject: '0x2222222222222222222222222222222222222222',
    tier: 'established',
    score: 72,
    successCount: 8,
    disputedCount: 1,
    failedCount: 0,
    amountUsd: 0.01,
    payer: '0x1111111111111111111111111111111111111111',
    transaction: 'provider-response-1',
    depositTxHash: '0xdeposit',
    paidAt: 100_000,
  }, '0x2222222222222222222222222222222222222222', 'buyer', 'room-paid-shadow');
  assert.equal(data.purchase?.observedState, 'unknown');
  assert.equal(data.snapshot?.state, 'unknown');
  assert.equal(data.snapshot?.reliability, 0);
  assert.equal(data.purchase?.data.paymentProofKind, 'provider-response-not-per-request-settlement');
  assert.deepEqual(data.snapshot?.provenance, ['provider:provider-response-1', 'deposit:0xdeposit']);
  const again = buildPaidEvidenceQualificationObservation({
    subject: '0x2222222222222222222222222222222222222222',
    tier: 'established', score: 72, successCount: 8, disputedCount: 1, failedCount: 0, amountUsd: 0.01,
    payer: '0x1111111111111111111111111111111111111111', transaction: 'provider-response-1', paidAt: 100_000,
  }, '0x2222222222222222222222222222222222222222', 'buyer', 'room-paid-shadow');
  assert.equal(again.idempotencyKey, data.idempotencyKey);
  assert.equal(again.snapshot?.id, data.snapshot?.id);
  assert.equal(again.snapshot?.responseHash, data.snapshot?.responseHash);
});
