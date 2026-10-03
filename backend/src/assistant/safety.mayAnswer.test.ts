import assert from 'node:assert/strict';
import test from 'node:test';
import { mayAnswer } from './safety.js';

test('an answer is held back only when it touches the account without a fresh read', () => {
  assert.equal(mayAnswer({ needsLiveState: false, grounded: false, subjects: 2 }), true);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: true, subjects: 1 }), true);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: false, subjects: 0 }), true);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: false, subjects: 1 }), false);
});
