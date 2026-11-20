import assert from 'node:assert/strict';
import test from 'node:test';
import { BEFORE_FIT_CHECK, passReasonOf } from './passReason.js';

/// Which selling-agent passes the seller hears about (view 96).

test('a pass the seller can act on is told, as their own setting or the request rule', () => {
  assert.equal(passReasonOf('no-ask-below'), 'under-lowest');
  assert.equal(passReasonOf('buyer-record'), 'buyer-record');
  assert.equal(passReasonOf('buyer-dispute-record'), 'buyer-record');
  assert.equal(passReasonOf('buyer-reputation-too-low'), 'buyer-record');
  assert.equal(passReasonOf('insufficient-stake-trusted-match'), 'needs-guarantee');
  assert.equal(passReasonOf('finance-lane-requires-business'), 'business-only');
});

test('a request that does not fit, one already handled, or the person\'s own choice is never told', () => {
  for (const r of ['no-topical-overlap', 'low-confidence-or-skip', 'already-bid', 'job-not-open', 'own-auction', 'seller-own-offer',
    'request-changed', 'direct-offer-pending', 'seller-abandoned', 'owner-declined', 'agent-not-linked', 'anything-new']) {
    assert.equal(passReasonOf(r), null, r);
  }
});

test('passes made before the work is checked are named, so the fit is checked first', () => {
  for (const r of BEFORE_FIT_CHECK) assert.notEqual(passReasonOf(r), null, r);
  assert.equal(BEFORE_FIT_CHECK.has('no-ask-below'), false, 'no-ask-below comes after the work check');
});
