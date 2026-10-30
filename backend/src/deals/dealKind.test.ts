import assert from 'node:assert/strict';
import test from 'node:test';
import { dealKindOf, kindOf } from './dealKind.js';

/// The kind of a deal is worked out once, from what the two agreed, and kept
/// on the deal (view 32).

test('goods, then stages, then one payment', () => {
  assert.equal(kindOf({ tradeType: 'goods', firstReleasePct: 100 }), 'goods');
  assert.equal(kindOf({ tradeType: 'mixed', firstReleasePct: 30, milestonePcts: [30, 70] }), 'goods');
  assert.equal(kindOf({ tradeType: 'service', firstReleasePct: 30, milestonePcts: [30, 70] }), 'milestones');
  assert.equal(kindOf({ firstReleasePct: 40 }), 'milestones');
  assert.equal(kindOf({ firstReleasePct: 100 }), 'one_time');
  assert.equal(kindOf({ firstReleasePct: 100, milestonePcts: [100] }), 'one_time');
});

test('a stored kind wins; an older deal without one is worked out as before', () => {
  assert.equal(dealKindOf({ dealKind: 'goods', firstReleasePct: 30, milestonePcts: [30, 70] }), 'goods');
  assert.equal(dealKindOf({ firstReleasePct: 30, milestonePcts: [30, 70] }), 'milestones');
});
