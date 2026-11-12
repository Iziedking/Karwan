import assert from 'node:assert/strict';
import test from 'node:test';
import { deskTime, firstName, greeting, waitLine, waited } from './homeWords';

const lagos = (h: number, m = 0) => Date.UTC(2026, 10, 12, h - 1, m);

test('the greeting follows the clock in Lagos', () => {
  assert.equal(greeting(lagos(6)), 'Good morning');
  assert.equal(greeting(lagos(11, 59)), 'Good morning');
  assert.equal(greeting(lagos(12)), 'Good afternoon');
  assert.equal(greeting(lagos(16, 59)), 'Good afternoon');
  assert.equal(greeting(lagos(17)), 'Good evening');
  assert.equal(greeting(lagos(23, 30)), 'Good evening');
});

test('the line under it says how many things wait', () => {
  assert.equal(waitLine(0), 'Nothing waits for you.');
  assert.equal(waitLine(1), 'One thing waits for you. Everything else is running.');
  assert.equal(waitLine(3), 'Three things wait for you. Everything else is running.');
  assert.equal(waitLine(12), '12 things wait for you. Everything else is running.');
});

test('how long something has waited reads short', () => {
  const MIN = 60_000;
  assert.equal(waited(0), 'just now');
  assert.equal(waited(14 * MIN), '14 min');
  assert.equal(waited(120 * MIN), '2 h');
  assert.equal(waited(130 * MIN), '2 h 10 min');
  assert.equal(waited(3 * 24 * 60 * MIN + 5 * MIN), '3 d');
});

test('the greeting uses the first name', () => {
  assert.equal(firstName('Israel Dominic'), 'Israel');
  assert.equal(firstName(null), null);
  assert.equal(firstName('  '), null);
});

test('desk times read the hour today and the day before, in Lagos, never seconds', () => {
  const now = lagos(15, 2);
  assert.equal(deskTime(lagos(14, 31), now), '14:31');
  assert.equal(deskTime(lagos(0, 5), now), '00:05');
  assert.equal(deskTime(lagos(14, 31) - 24 * 3_600_000, now), '11 Nov 14:31');
});
