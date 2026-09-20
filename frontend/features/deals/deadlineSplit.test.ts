import assert from 'node:assert/strict';
import test from 'node:test';
import { splitDeadline } from './deadlineSplit.js';

test('hours never reach 24, whatever the remainder rounds to', () => {
  // 14399 minutes: the value that made "save changes" fail with a 400.
  assert.deepEqual(splitDeadline(14_399 * 60), { days: 10, hours: 0 });
  assert.deepEqual(splitDeadline(23 * 3600 + 59 * 60), { days: 1, hours: 0 });
});

test('whole units stay exact', () => {
  assert.deepEqual(splitDeadline(0), { days: 0, hours: 0 });
  assert.deepEqual(splitDeadline(3600), { days: 0, hours: 1 });
  assert.deepEqual(splitDeadline(86_400), { days: 1, hours: 0 });
  assert.deepEqual(splitDeadline(7 * 86_400 + 5 * 3600), { days: 7, hours: 5 });
});

test('a partial hour rounds up so the seller never gets less time than shown', () => {
  assert.deepEqual(splitDeadline(90 * 60), { days: 0, hours: 2 });
  assert.deepEqual(splitDeadline(-5), { days: 0, hours: 0 });
});
