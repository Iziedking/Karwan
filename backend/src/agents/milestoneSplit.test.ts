import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveMilestonePcts } from './milestoneSplit.js';

test('a request with one payment funds one milestone, not the profile default', () => {
  assert.deepEqual(effectiveMilestonePcts([100], [50, 50]), [100]);
  assert.deepEqual(effectiveMilestonePcts([30, 70], [50, 50]), [30, 70]);
  assert.deepEqual(effectiveMilestonePcts([20, 20, 20, 20, 20], [50, 50]), [20, 20, 20, 20, 20]);
});

test('an invalid stated split falls back to the profile default', () => {
  for (const bad of [undefined, [], [60, 60], [0, 100], [10, 10, 10, 10, 10, 50], [50.5, 49.5]]) {
    assert.deepEqual(effectiveMilestonePcts(bad, [40, 60]), [40, 60], JSON.stringify(bad));
  }
});
