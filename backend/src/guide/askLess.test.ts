import assert from 'node:assert/strict';
import test from 'node:test';
import { SNOOZE_AGAIN_MS, SNOOZE_FIRST_MS, afterSnooze, setupAllowed, utcDay } from './askLess.js';

/// Aman asks less (view 57, 15 Nov evening): Not now holds a setup step for
/// 3 days, then 14, on the account; at most one setup ask a day.

const NOW = Date.UTC(2026, 10, 15, 12);
const DAY = 86_400_000;

test('Not now holds a step 3 days, then 14 days every time after', () => {
  assert.equal(SNOOZE_FIRST_MS, 3 * DAY);
  assert.equal(SNOOZE_AGAIN_MS, 14 * DAY);
  assert.deepEqual(afterSnooze(undefined, NOW), { until: NOW + 3 * DAY, count: 1 });
  assert.deepEqual(afterSnooze({ until: NOW - 1, count: 1 }, NOW), { until: NOW + 14 * DAY, count: 2 });
  assert.deepEqual(afterSnooze({ until: NOW - 1, count: 2 }, NOW), { until: NOW + 14 * DAY, count: 3 });
});

test('a snoozed step is not asked until its time is up', () => {
  const settings = { guideSnooze: { telegram: { until: NOW + DAY, count: 1 } } };
  assert.equal(setupAllowed(settings, 'telegram', NOW), false);
  assert.equal(setupAllowed(settings, 'telegram', NOW + DAY), true);
  assert.equal(setupAllowed(settings, 'money', NOW), true);
});

test('one setup ask a day: the step already asked today may come back, another waits', () => {
  const today = utcDay(NOW);
  assert.equal(today, '2026-11-15');
  const settings = { guideAskedOn: today, guideAskedStep: 'telegram' as const };
  assert.equal(setupAllowed(settings, 'telegram', NOW), true);
  assert.equal(setupAllowed(settings, 'first_deal', NOW), false);
  assert.equal(setupAllowed(settings, 'first_deal', NOW + DAY), true);
  assert.equal(setupAllowed({}, 'first_deal', NOW), true);
});
