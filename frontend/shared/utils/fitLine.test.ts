import assert from 'node:assert/strict';
import test from 'node:test';
import { needsRefit } from './fitLine.js';

test('a narrower column always refits, so the address is never cut short', () => {
  assert.equal(needsRefit(400, 385), true);
  assert.equal(needsRefit(400, 399), true);
});

test('a change in height alone, or a scrollbar going away, does not refit', () => {
  assert.equal(needsRefit(400, 400), false);
  assert.equal(needsRefit(385, 400), false);
  assert.equal(needsRefit(385, 409), false);
});

test('a real widening refits so the address can grow back', () => {
  assert.equal(needsRefit(320, 400), true);
});
