import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkView, WorkWeekView } from '@/core/api';
import { hoursText, localDay, localWhen, startLine, minutesFrom, monthLine, runsText, sessionPrice, sessionPriceTyped, sessionRows, validLink, weekLine, workActions, workRequestHref } from './workModel';

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

test('a month of sessions lists them newest first, each with its number (view 76)', () => {
  const w = week({ loggedMinutes: 3, log: [
    { at: 1 * DAY, minutes: 1, note: 'Test' },
    { at: 3 * DAY, minutes: 1, note: 'Algebra', link: 'https://example.com/2' },
    { at: 5 * DAY, minutes: 1, note: 'Fractions', flagged: { at: 6 * DAY, note: 'Nobody came' } },
  ] });
  assert.deepEqual(sessionRows(w).map((s) => [s.n, s.note, s.link ?? null, s.flagged?.note ?? null]), [
    [3, 'Fractions', null, 'Nobody came'], [2, 'Algebra', 'https://example.com/2', null], [1, 'Test', null, null],
  ]);
});

test('a session has a price only when the month divides evenly', () => {
  assert.equal(sessionPrice('300000000', 12), '25000000');
  assert.equal(sessionPrice('300000000', 7), null);
  assert.equal(sessionPrice('300000000', undefined), null);
});

test('a session link is optional, https and short', () => {
  assert.equal(validLink(''), true);
  assert.equal(validLink('https://example.com/lesson-6'), true);
  assert.equal(validLink('http://example.com'), false);
  assert.equal(validLink('https://a b'), false);
  assert.equal(validLink(`https://example.com/${'a'.repeat(300)}`), false);
});

test('a month of sessions tells each side its next date', () => {
  const m = week({ start: 10 * DAY, end: 38 * DAY, logBy: 40 * DAY, reviewBy: 43 * DAY });
  assert.equal(monthLine(m, 'hirer', 20 * DAY), 'review-after');
  assert.equal(monthLine(m, 'hirer', 39 * DAY), 'review-by');
  assert.equal(monthLine(m, 'worker', 39 * DAY), 'record-by');
  assert.equal(monthLine(m, 'worker', 41 * DAY), 'review-by');
  assert.equal(monthLine(m, 'hirer', 9 * DAY), 'not-started');
  assert.equal(monthLine({ ...m, status: 'objected' }, 'hirer', 41 * DAY), 'with-review');
  assert.equal(monthLine({ ...m, status: 'settled' }, 'worker', 50 * DAY), 'settled');
});

test('the request form hands what was typed to the posting form', () => {
  assert.equal(workRequestHref('monthly', ' A maths tutor, 3 lessons a week '), '/work/requests/new?kind=monthly&brief=A+maths+tutor%2C+3+lessons+a+week');
  assert.equal(workRequestHref('hourly', ''), '/work/requests/new?kind=hourly');
});

test('one week and one month are said in the singular (P-05, 11 Nov)', () => {
  const page = { weeks: '{n} weeks', months: '{n} months', oneWeek: '1 week', oneMonth: '1 month' };
  assert.equal(runsText(1, false, page), '1 month');
  assert.equal(runsText(3, false, page), '3 months');
  assert.equal(runsText(1, true, page), '1 week');
  assert.equal(runsText(4, true, page), '4 weeks');
});

test('the price of one session shows for any month, not only one that divides to a cent (X-06, 11 Nov)', () => {
  assert.equal(sessionPriceTyped('222.877647', '12'), '18.573137');
  assert.equal(sessionPriceTyped('20', '4'), '5');
  assert.equal(sessionPriceTyped('20', ''), null);
  assert.equal(sessionPriceTyped('', '4'), null);
});

test('before it starts, the worker reads what opens and the hirer reads when it starts (S-07)', () => {
  const on = { status: 'active', role: 'worker', kind: 'monthly', sessions: 4 } as const;
  assert.equal(startLine(on), 'record-from');
  assert.equal(startLine({ ...on, sessions: undefined }), 'claim-from');
  assert.equal(startLine({ ...on, kind: 'hourly', sessions: undefined }), 'log-from');
  assert.equal(startLine({ ...on, status: 'ending' }), 'record-from');
  assert.equal(startLine({ ...on, role: 'hirer' }), 'starts');
  // Not accepted yet: nothing opens for them until they say yes.
  assert.equal(startLine({ ...on, status: 'offered' }), 'starts');
});

test('a start reads with its time, in the viewer own zone', () => {
  const instant = Date.UTC(2026, 10, 12, 1, 54, 35);
  assert.equal(localWhen(instant, 'en-GB'), new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(instant));
  assert.notEqual(localWhen(instant, 'en-GB'), localDay(instant, 'en-GB'));
});
