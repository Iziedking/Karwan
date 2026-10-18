import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptErrorKind } from './acceptOffer';

/// Accepting an early-payment offer fails in a few known ways; each one gets a
/// plain sentence instead of a raw revert. Unknown errors pass through.
///
///   npx tsx --test features/factoring/acceptOffer.test.ts

test('known accept failures are recognised', () => {
  assert.equal(acceptErrorKind('execution reverted: transferWithAuthorization: invalid signature'), 'authorization');
  assert.equal(acceptErrorKind('receipt-reconciliation-required'), 'reconcile');
  assert.equal(acceptErrorKind('AlreadyAssigned()'), 'alreadyAssigned');
  assert.equal(acceptErrorKind('PoDLocked'), 'windowClosed');
  assert.equal(acceptErrorKind('advance and assignment failed'), 'notAccepted');
});

test('anything else is shown as it came', () => {
  assert.equal(acceptErrorKind('network down'), null);
});
