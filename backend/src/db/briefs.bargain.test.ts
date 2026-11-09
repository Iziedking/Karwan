import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bargainOnBrief, stampBargain, type Brief } from './briefs.js';

/// View 73: whether a request bargains is decided once, when it is posted, so
/// a negotiation in flight finishes on the rules it started with.

const input = { jobId: '0xA', briefText: 'Four clothes sewn', postedBy: '0xB' };
const stored = (b: Omit<Brief, 'createdAt'>): Brief => ({ ...b, createdAt: 1 });

test('a request posted with the switch on keeps it after the switch goes off', () => {
  const brief = stored(stampBargain(input, true));
  assert.equal(brief.bargainV73, true);
  // The switch is read at post time only; the record decides from then on.
  assert.equal(bargainOnBrief(brief), true);
});

test('a request posted with the switch off stays off after the switch goes on', () => {
  assert.equal(bargainOnBrief(stored(stampBargain(input, false))), false);
});

test('an old request without the field is off', () => {
  assert.equal(bargainOnBrief(stored(input)), false);
});

test('a missing request is off', () => {
  assert.equal(bargainOnBrief(null), false);
});

test('a request that already carries the choice keeps it', () => {
  assert.equal(stampBargain({ ...input, bargainV73: true }, false).bargainV73, true);
});
