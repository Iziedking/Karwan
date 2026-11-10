import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nowLine } from './nowLine.js';

// Tuesday 10 November 2026, 18:57 UTC is 19:57 in Lagos.
const AT = Date.UTC(2026, 10, 10, 18, 57);

test('the assistant is told the weekday and the time where the person is', () => {
  const line = nowLine(AT, 'Africa/Lagos');
  assert.match(line, /It is Tuesday 10 November 2026, 19:57 in Lagos/);
  assert.match(line, /2026-11-10T18:57:00\.000Z UTC/);
});

test('the coming Friday is named with its date, so nobody counts days', () => {
  const line = nowLine(AT, 'Africa/Lagos');
  assert.match(line, /Friday 2026-11-13/);
  assert.match(line, /Tuesday 2026-11-17/);
  assert.match(line, /Never ask them what today is/);
});

test('the day is the person\'s day, not the server\'s', () => {
  // 23:30 UTC on Tuesday is already Wednesday in Lagos.
  const late = Date.UTC(2026, 10, 10, 23, 30);
  assert.match(nowLine(late, 'Africa/Lagos'), /It is Wednesday 11 November 2026, 00:30 in Lagos/);
  assert.match(nowLine(late, 'America/New_York'), /It is Tuesday 10 November 2026, 18:30 in New York/);
});
