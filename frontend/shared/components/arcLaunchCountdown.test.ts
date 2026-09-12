import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARC_MAINNET_LAUNCH_AT,
  formatArcCountdownUnit,
  getArcCountdownParts,
} from './arcLaunchCountdownModel';

test('counts down to the Arc Mainnet livestream timestamp', () => {
  const now = ARC_MAINNET_LAUNCH_AT - (4 * 86_400 + 3 * 3_600 + 12 * 60 + 9) * 1000;

  assert.deepEqual(getArcCountdownParts(now), {
    totalMs: (4 * 86_400 + 3 * 3_600 + 12 * 60 + 9) * 1000,
    days: 4,
    hours: 3,
    minutes: 12,
    seconds: 9,
  });
});

test('does not go negative after the event starts', () => {
  assert.deepEqual(getArcCountdownParts(ARC_MAINNET_LAUNCH_AT + 1), {
    totalMs: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
});

test('keeps countdown digits stable at two characters', () => {
  assert.equal(formatArcCountdownUnit(4), '04');
  assert.equal(formatArcCountdownUnit(18), '18');
});
