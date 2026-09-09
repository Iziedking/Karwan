import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceReceiptCopyKey, evidenceReceiptTone } from './evidenceReceipt.js';

test('maps every chain receipt state to deliberate UI copy', () => {
  assert.equal(evidenceReceiptCopyKey('pass'), 'pass');
  assert.equal(evidenceReceiptCopyKey('stale-terms'), 'staleTerms');
  assert.equal(evidenceReceiptCopyKey('read-unavailable'), 'readUnavailable');
});

test('reserves the positive tone for current PASS evidence', () => {
  assert.equal(evidenceReceiptTone('pass'), 'positive');
  assert.equal(evidenceReceiptTone('mismatch'), 'warning');
  assert.equal(evidenceReceiptTone('not-recorded'), 'neutral');
});
