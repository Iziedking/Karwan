import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryCheckDetail, deliveryCheckReason } from './deliveryCheck.js';
import { releaseBlockReasonForDelivery } from './releaseBlock.js';

const cases = [
  [{ verificationStatus: 'malicious' as const }, 'security-hold'],
  [{ deliveryMatch: { verdict: 'mismatch' as const } }, 'off-request'],
  [{ evidenceRequired: true }, 'check-pending'],
  [{ evidenceReceipt: { state: 'mismatch' as const } }, 'evidence-mismatch'],
  [{ evidenceReceipt: { state: 'expired' as const } }, 'check-expired'],
  [{ evidenceReceipt: { state: 'stale-terms' as const } }, 'terms-changed'],
  [{ evidenceReceipt: { state: 'stale-delivery' as const } }, 'delivery-replaced'],
  [{ evidenceReceipt: { state: 'read-unavailable' as const } }, 'check-pending'],
  [{ verificationStatus: 'unverifiable' as const }, 'link-unverifiable'],
] as const;

test('every paused release gets a reason, and a clean delivery gets none', () => {
  for (const [input, detail] of cases) {
    assert.equal(deliveryCheckDetail(input), detail, JSON.stringify(input));
    // A reason is given exactly when release is blocked.
    assert.notEqual(releaseBlockReasonForDelivery(input), null, JSON.stringify(input));
  }
  assert.equal(deliveryCheckDetail({ evidenceReceipt: { state: 'pass' } }), null);
  assert.equal(releaseBlockReasonForDelivery({ evidenceReceipt: { state: 'pass' } }), null);
});

test('the seller is told what to do without the buyer-private review', () => {
  assert.match(deliveryCheckReason('security-hold', 'seller'), /Send a corrected link/);
  assert.match(deliveryCheckReason('off-request', 'buyer'), /does not match what you asked for/);
  assert.match(deliveryCheckReason('off-request', 'seller'), /your delivery may not match the request. Send the right link/);
});
