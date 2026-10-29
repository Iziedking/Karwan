import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkView, WorkWeekView } from '@/core/api';
import { hoursText, localDay, minutesFrom, weekLine, workActions } from './workModel';

const DAY = 86_400_000;
const week = (over: Partial<WorkWeekView> = {}): WorkWeekView => ({
  k: 0, fundedMicros: '301500000', loggedMinutes: 0, approvedMinutes: 0, objectedMinutes: 0, log: [], status: 'funded',
  start: 10 * DAY, end: 17 * DAY, logBy: 19 * DAY, reviewBy: 22 * DAY, settleAt: 19 * DAY,
  canLog: false, canApprove: false, canObject: false, ifPaid: { netMicros: '0', backMicros: '0', feeMicros: '0' }, ...over,
});

test('hours read as hours and minutes', () => {
  assert.equal(hoursText(750), '12 h 30 m');
  assert.equal(hoursText(45), '45 m');
  assert.equal(hoursText(180), '3 h');
});

test('hours typed as hours and minutes become whole minutes, or nothing', () => {
  assert.equal(minutesFrom('12', '30'), 750);
  assert.equal(minutesFrom('', '45'), 45);
  assert.equal(minutesFrom('1.5', ''), null);
  assert.equal(minutesFrom('1', '60'), null);
  assert.equal(minutesFrom('0', '0'), null);
});

test('a week reads where it is in its life', () => {
  assert.equal(weekLine(week(), 9 * DAY), 'not-started');
  assert.equal(weekLine(week(), 12 * DAY), 'logging');
  assert.equal(weekLine(week({ status: 'logged' }), 20 * DAY), 'in-review');
  assert.equal(weekLine(week({ status: 'objected' }), 20 * DAY), 'with-review');
  assert.equal(weekLine(week({ status: 'settled' }), 30 * DAY), 'settled');
});

test('the date is the viewer own, from the same instant', () => {
  const instant = Date.UTC(2026, 10, 2, 23, 30);
  assert.equal(localDay(instant, 'en-GB'), new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(instant));
});

test('each side sees only its own steps', () => {
  const base = { canAccept: false, canTakeBack: false, canGiveNotice: false, nextWeek: null, role: 'hirer' } as unknown as WorkView;
  assert.deepEqual(workActions({ ...base, role: 'worker', canAccept: true }), ['accept', 'decline']);
  assert.deepEqual(workActions({ ...base, canTakeBack: true }), ['takeBack']);
  assert.deepEqual(workActions({ ...base, nextWeek: { k: 1, totalMicros: '1' }, canGiveNotice: true }), ['fund', 'notice']);
  assert.deepEqual(workActions({ ...base, role: 'worker', nextWeek: { k: 1, totalMicros: '1' } }), []);
});
