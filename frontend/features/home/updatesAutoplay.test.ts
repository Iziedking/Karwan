import assert from 'node:assert/strict';
import test from 'node:test';
import { nextUpdateMove, updatesMayMove } from './updatesAutoplay';

///   npx tsx --test features/home/updatesAutoplay.test.ts

test('the strip pages forward, and from the last page back to the first', () => {
  assert.equal(nextUpdateMove({ start: true, end: false }), 'next');
  assert.equal(nextUpdateMove({ start: false, end: false }), 'next');
  assert.equal(nextUpdateMove({ start: false, end: true }), 'restart');
});

test('nothing moves when every card already fits', () => {
  assert.equal(nextUpdateMove({ start: true, end: true }), null);
});

test('it holds still under the pointer or focus, with reduced motion, or in a hidden tab', () => {
  assert.equal(updatesMayMove({ paused: false, reducedMotion: false, hidden: false }), true);
  assert.equal(updatesMayMove({ paused: true, reducedMotion: false, hidden: false }), false);
  assert.equal(updatesMayMove({ paused: false, reducedMotion: true, hidden: false }), false);
  assert.equal(updatesMayMove({ paused: false, reducedMotion: false, hidden: true }), false);
});
