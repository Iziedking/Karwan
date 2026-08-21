import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ledgerAmountLabel,
  ledgerDirection,
  ledgerReferenceLabel,
  ledgerStatusTone,
} from './ledgerPresentation';

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

test('signs a ledger amount by the direction of its kind', () => {
  assert.equal(ledgerAmountLabel('1200.00', 'payout'), '+1200.00 USDC');
  assert.equal(ledgerAmountLabel('1200.00', 'release'), '-1200.00 USDC');
  assert.equal(ledgerAmountLabel(' 40.5 ', 'deposit'), '+40.5 USDC');
});

test('shows an unrecognised kind without a sign rather than guessing', () => {
  assert.equal(ledgerDirection('something_new'), 'flat');
  assert.equal(ledgerAmountLabel('9.00', 'something_new'), '9.00 USDC');
});

test('renders nothing when a row carries no amount', () => {
  assert.equal(ledgerAmountLabel(null, 'payout'), null);
  assert.equal(ledgerAmountLabel('', 'release'), null);
  assert.equal(ledgerAmountLabel('   ', 'release'), null);
});
