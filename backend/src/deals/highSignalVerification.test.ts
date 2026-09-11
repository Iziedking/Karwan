import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHighSignalVerification,
  highSignalBlockedMessage,
  isHighSignalVerified,
  requiresHighSignal,
  updateHighSignalParty,
} from './highSignalVerification.js';

test('high-signal deal policy requires only the selected party', () => {
    const seller = createHighSignalVerification('seller');
    assert.equal(requiresHighSignal('seller', 'seller'), true);
    assert.equal(requiresHighSignal('seller', 'buyer'), false);
    assert.equal(seller.buyer, undefined);
    assert.equal(isHighSignalVerified(seller, 'buyer'), true);
    assert.equal(isHighSignalVerified(seller, 'seller'), false);
});

test('high-signal deal policy requires both parties and unlocks independently', () => {
    const initial = createHighSignalVerification('both');
    assert.equal(isHighSignalVerified(initial, 'buyer'), false);
    assert.equal(isHighSignalVerified(initial, 'seller'), false);

    const buyerVerified = updateHighSignalParty(initial, 'buyer', {
      status: 'verified',
      verifiedAt: 123,
    });
    assert.equal(isHighSignalVerified(buyerVerified, 'buyer'), true);
    assert.equal(isHighSignalVerified(buyerVerified, 'seller'), false);
});

test('high-signal deal policy keeps unavailable and rejected proof blocked', () => {
    const pending = createHighSignalVerification('buyer');
    const unavailable = updateHighSignalParty(pending, 'buyer', { status: 'unavailable' });
    const rejected = updateHighSignalParty(pending, 'buyer', { status: 'rejected' });
    assert.equal(isHighSignalVerified(unavailable, 'buyer'), false);
    assert.equal(isHighSignalVerified(rejected, 'buyer'), false);
    assert.match(highSignalBlockedMessage('buyer'), /before funding/);
});
