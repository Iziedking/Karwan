import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryFailedCheck, timeoutRuling } from './disputeTimeout.js';

test('a delivery that passed the check keeps the money when the dispute times out', () => {
  assert.equal(timeoutRuling({ delivered: true }).sellerBps, 10000);
  assert.equal(timeoutRuling({ delivered: true, deliveryMatch: { verdict: 'aligned', reason: '' } }).sellerBps, 10000);
});

test('a delivery the check failed is refunded in full on the timer, never paid', () => {
  for (const deal of [
    { delivered: true, releaseBlockedReason: 'requirement-mismatch' as const },
    { delivered: true, releaseBlockedReason: 'security-hold' as const },
    { delivered: true, deliveryMatch: { verdict: 'mismatch' as const, reason: 'generic link' } },
  ]) {
    assert.equal(deliveryFailedCheck(deal), true);
    assert.equal(timeoutRuling(deal).sellerBps, 0);
  }
});

test('no delivery is a full refund', () => {
  assert.equal(timeoutRuling({ delivered: false }).sellerBps, 0);
});

test('a check that could not run is not treated as a failure', () => {
  const deal = { delivered: true, releaseBlockedReason: 'evidence-unavailable' as const };
  assert.equal(deliveryFailedCheck(deal), false);
  assert.equal(timeoutRuling(deal).sellerBps, 10000);
});
