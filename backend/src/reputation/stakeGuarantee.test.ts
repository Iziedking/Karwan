import assert from 'node:assert/strict';
import test from 'node:test';
import { withGuarantee } from './stakeGuarantee.js';

const NOW = 1_800_000_000;
const DAY = 86_400;
const empty = { stakeUsdc: 0, freeStakeUsdc: 0, reservedUsdc: 0, stakeDays: 0 };

test('a guarantee counts as stake, and what deals hold is not free', () => {
  const out = withGuarantee(empty, { inPlaceUsdc: 100, heldUsdc: 40, sinceSecs: NOW - 10 * DAY }, NOW);
  assert.deepEqual(out, { stakeUsdc: 100, freeStakeUsdc: 60, reservedUsdc: 40, stakeDays: 10 });
});

test('the guarantee adds to stake still on the previous vault, and its time does not carry over', () => {
  const out = withGuarantee({ stakeUsdc: 250, freeStakeUsdc: 250, reservedUsdc: 0, stakeDays: 200 }, { inPlaceUsdc: 50, heldUsdc: 0, sinceSecs: NOW - 2 * DAY }, NOW);
  assert.equal(out.stakeUsdc, 300);
  assert.equal(out.freeStakeUsdc, 300);
  assert.equal(out.stakeDays, 200);
});

test('no guarantee, or one with no known start, leaves the time as it was', () => {
  assert.deepEqual(withGuarantee(empty, null, NOW), empty);
  assert.equal(withGuarantee(empty, { inPlaceUsdc: 10, heldUsdc: 0, sinceSecs: null }, NOW).stakeDays, 0);
});
