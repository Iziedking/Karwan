import assert from 'node:assert/strict';
import test from 'node:test';
import { closedForOffers } from './offerWindow.js';

const open = { finalized: false, escrowFunded: false, expired: false };

test('an open request still takes offers', () => {
  assert.equal(closedForOffers(open, false), false);
});

test('funded, expired or cancelled requests take no more offers', () => {
  assert.equal(closedForOffers({ ...open, escrowFunded: true }, false), true);
  assert.equal(closedForOffers({ ...open, expired: true }, false), true);
});

test('a matched request is closed, unless a near miss still invites better offers', () => {
  assert.equal(closedForOffers({ ...open, finalized: true }, false), true);
  assert.equal(closedForOffers({ ...open, finalized: true }, true), false);
});
