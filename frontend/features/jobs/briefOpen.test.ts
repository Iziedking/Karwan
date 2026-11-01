import assert from 'node:assert/strict';
import test from 'node:test';
import { briefOpenForChange } from './briefOpen';

const open = { finalized: false, escrowFunded: false };

test('an open request can change', () => {
  assert.equal(briefOpenForChange(open, false), true);
});

test('a request with no deal can still change or be cancelled', () => {
  assert.equal(briefOpenForChange({ ...open, finalized: true, negotiationEndedAt: 1 }, false), true);
});

test('a match in play, a funded deal or a closed request cannot', () => {
  assert.equal(briefOpenForChange({ ...open, finalized: true }, false), false);
  assert.equal(briefOpenForChange(open, true), false);
  assert.equal(briefOpenForChange({ ...open, escrowFunded: true }, false), false);
  assert.equal(briefOpenForChange({ ...open, expiredAt: 1 }, false), false);
  assert.equal(briefOpenForChange({ ...open, cancelledAt: 1 }, false), false);
});
