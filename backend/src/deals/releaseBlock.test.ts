import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseBlockReasonForDelivery } from './releaseBlock.js';

test('unknown delivery evidence pauses unattended release without becoming a failure', () => {
  assert.equal(
    releaseBlockReasonForDelivery({ deliveryMatch: { verdict: 'unknown' } }),
    'evidence-unavailable',
  );
  assert.equal(
    releaseBlockReasonForDelivery({ verificationStatus: 'unverifiable' }),
    'evidence-unavailable',
  );
});

test('a clear mismatch pauses unattended release for buyer review', () => {
  assert.equal(
    releaseBlockReasonForDelivery({ deliveryMatch: { verdict: 'mismatch' } }),
    'requirement-mismatch',
  );
});

test('CRE mismatch and unreadable receipts pause unattended release', () => {
  assert.equal(
    releaseBlockReasonForDelivery({ evidenceReceipt: { state: 'mismatch' } }),
    'requirement-mismatch',
  );
  for (const state of ['unavailable', 'expired', 'stale-terms', 'stale-delivery', 'read-unavailable'] as const) {
    assert.equal(releaseBlockReasonForDelivery({ evidenceReceipt: { state } }), 'evidence-unavailable');
  }
  assert.equal(releaseBlockReasonForDelivery({ evidenceReceipt: { state: 'pass' } }), null);
  assert.equal(releaseBlockReasonForDelivery({ evidenceReceipt: { state: 'not-recorded' } }), null);
});

test('required evidence blocks absent or unconfigured receipts', () => {
  assert.equal(
    releaseBlockReasonForDelivery({ evidenceRequired: true, evidenceReceipt: { state: 'not-recorded' } }),
    'evidence-unavailable',
  );
  assert.equal(
    releaseBlockReasonForDelivery({ evidenceRequired: true, evidenceReceipt: { state: 'not-configured' } }),
    'evidence-unavailable',
  );
});

test('link safety holds take precedence over requirement evidence', () => {
  assert.equal(
    releaseBlockReasonForDelivery({
      verificationStatus: 'malicious',
      deliveryMatch: { verdict: 'mismatch' },
    }),
    'security-hold',
  );
});

test('aligned and partial evidence leave the human release path available', () => {
  assert.equal(
    releaseBlockReasonForDelivery({ deliveryMatch: { verdict: 'aligned' } }),
    null,
  );
  assert.equal(
    releaseBlockReasonForDelivery({ deliveryMatch: { verdict: 'partial' } }),
    null,
  );
});
