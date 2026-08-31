import assert from 'node:assert/strict';
import test from 'node:test';
import { TIER_HUE } from './tierColors';

test('every reputation tier has its own visual identity', () => {
  assert.equal(new Set(Object.values(TIER_HUE)).size, 5);
  assert.equal(TIER_HUE.ESTABLISHED, 'var(--lp-accent)');
  assert.notEqual(TIER_HUE.ESTABLISHED, TIER_HUE.STRONG);
  assert.notEqual(TIER_HUE.STRONG, TIER_HUE.ELITE);
});
