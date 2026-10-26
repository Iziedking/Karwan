import assert from 'node:assert/strict';
import test from 'node:test';
import { enterSends } from './enterSends';

const key = (over: Partial<{ key: string; shiftKey: boolean; isComposing: boolean }> = {}) => ({
  key: 'Enter', shiftKey: false, isComposing: false, ...over,
});

test('on a computer Enter sends and Shift+Enter adds a line', () => {
  assert.equal(enterSends(key(), false), true);
  assert.equal(enterSends(key({ shiftKey: true }), false), false);
});

test('on a phone the keyboard Enter adds a line; the send button sends', () => {
  assert.equal(enterSends(key(), true), false);
});

test('other keys and a word still being composed never send', () => {
  assert.equal(enterSends(key({ key: 'a' }), false), false);
  assert.equal(enterSends(key({ isComposing: true }), false), false);
});
