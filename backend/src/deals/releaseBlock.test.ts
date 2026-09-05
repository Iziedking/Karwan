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
