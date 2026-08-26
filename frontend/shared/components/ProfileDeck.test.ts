import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeckSwipe } from './ProfileDeck';

test('a deliberate horizontal swipe advances one profile section', () => {
  assert.equal(resolveDeckSwipe(-72, 8), 'next');
  assert.equal(resolveDeckSwipe(72, 8), 'previous');
});

test('short movement does not change profile sections', () => {
  assert.equal(resolveDeckSwipe(-55, 0), null);
  assert.equal(resolveDeckSwipe(55, 0), null);
});

test('vertical and diagonal scrolling never pages the profile deck', () => {
  assert.equal(resolveDeckSwipe(-80, 72), null);
  assert.equal(resolveDeckSwipe(64, 56), null);
  assert.equal(resolveDeckSwipe(12, 120), null);
});
