import assert from 'node:assert/strict';
import test from 'node:test';
import { sequenceCursor } from './replayCursor.js';

test('sequence cursor accepts numeric and scoped SSE cursor forms', () => {
  assert.equal(sequenceCursor('238'), 238);
  assert.equal(sequenceCursor('room-1:238'), 238);
});

test('sequence cursor rejects negative, fractional, unsafe, and malformed values', () => {
  assert.equal(sequenceCursor(undefined), 0);
  assert.equal(sequenceCursor('-1'), 0);
  assert.equal(sequenceCursor('2.5'), 0);
  assert.equal(sequenceCursor('9007199254740992'), 0);
  assert.equal(sequenceCursor('room-1:not-a-number'), 0);
});
