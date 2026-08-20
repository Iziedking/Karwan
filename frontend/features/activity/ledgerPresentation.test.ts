import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerReferenceLabel, ledgerStatusTone } from './ledgerPresentation';

test('keeps the complete durable reference for support and receipts', () => {
  assert.equal(ledgerReferenceLabel(' KWN-2345-ABCD-EFGH '), 'KWN-2345-ABCD-EFGH');
  assert.equal(ledgerReferenceLabel(''), null);
  assert.equal(ledgerReferenceLabel(null), null);
});

test('maps ledger state into presentation tone without inventing states', () => {
  assert.equal(ledgerStatusTone('done'), 'positive');
  assert.equal(ledgerStatusTone('pending'), 'pending');
  assert.equal(ledgerStatusTone('failed'), 'failed');
});
