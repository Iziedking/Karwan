import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkApproveConfirm, buildWorkFlagConfirm, buildWorkUnflagConfirm, buildWorkHoursConfirm, buildWorkObjectConfirm, buildWorkOfferConfirm, buildWorkRequestPostConfirm } from './work.js';
import { ROUTES as executorRoutes } from '../channels/executor.js';

/// View 76: the assistant's cards for monthly work counted in sessions.
///
///   node ../scripts/run-tests.mjs src/assistant/workSessions.test.ts

const lessons = { id: 'w_1', title: 'Maths lessons', kind: 'monthly' as const, sessions: 12 };
const retainer = { id: 'w_2', title: 'Bookkeeping', kind: 'monthly' as const };

test('the hire card names the sessions', () => {
  const input = { worker: '@ada', kind: 'monthly' as const, rateUsdc: '300', periods: 3, sessions: 12, title: 'Maths lessons', brief: '' };
  const card = buildWorkOfferConfirm(input, { kind: 'monthly', title: 'Maths lessons', rateMicros: '300000000', maxHours: 1, periods: 3, sessions: 12, startsAt: Date.UTC(2026, 10, 16), feeHalfMicros: '1500000', totalMicros: '301500000', mostMicros: '904500000', note: 'n' }, '@ada');
  assert.match(card.summary, /300\.00 USDC a month for 12 sessions, for 3 months/);
  assert.equal(card.payload.sessions, 12);
});

test('a hire said in naira reads in naira, with the exact USDC on what is paid now (L-06)', () => {
  const said = { usdc: 222.869, currency: 'NGN' as const, amount: '300000', text: '₦300,000', quote: 'q' };
  const input = { worker: '@ada', kind: 'monthly' as const, rateUsdc: '222.869', periods: 3, sessions: 12, title: 'Maths lessons', brief: '' };
  const card = buildWorkOfferConfirm(input, { kind: 'monthly', title: 'Maths lessons', rateMicros: '222869000', maxHours: 1, periods: 3, sessions: 12, startsAt: Date.UTC(2026, 10, 16), feeHalfMicros: '1114345', totalMicros: '223983345', mostMicros: '671950035', note: 'n' }, '@ada', said);
  assert.match(card.summary, /^₦300,000 a month for 12 sessions, for 3 months/);
  assert.doesNotMatch(card.summary, /USDC/);
  const row = (label: RegExp) => card.fields.find((f) => label.test(f.label))?.value;
  assert.equal(row(/^First month/), '₦300,000');
  assert.equal(row(/^Karwan fee/), '₦1,500');
  assert.equal(row(/^You pay now/), '₦301,500 · 223.98 USDC');
  assert.equal(row(/^The most for all/), '₦904,500');
  assert.equal(card.confirmLabel, 'Pay ₦301,500');
  assert.equal(card.payload.rateUsdc, '222.869', 'the record still moves the USDC the quote fixed');
});

test('recording a session is one unit with its note and link; a retainer still claims the month', () => {
  const s = buildWorkHoursConfirm(lessons, { minutes: 45, note: 'Fractions', link: 'https://example.com/rec' });
  assert.equal(s.title, 'Record a session on Maths lessons');
  assert.deepEqual(s.payload, { workId: 'w_1', minutes: 1, note: 'Fractions', link: 'https://example.com/rec' });
  assert.equal(s.confirmLabel, 'Record the session');
  const r = buildWorkHoursConfirm(retainer, { minutes: 1, note: '' });
  assert.equal(r.title, 'Claim this month of Bookkeeping');
  assert.equal(r.payload.link, undefined);
});

test('the flag card says no money moves', () => {
  const f = buildWorkFlagConfirm(lessons, { k: 0, n: 2, note: 'Nobody came' });
  assert.equal(f.intent, 'work_flag');
  assert.match(f.summary, /No money moves now/);
  assert.deepEqual(f.payload, { workId: 'w_1', k: 0, n: 2, note: 'Nobody came' });
});

test('the take-back card names the session and says the worker is told', () => {
  const u = buildWorkUnflagConfirm(lessons, { k: 0, n: 2 });
  assert.equal(u.intent, 'work_unflag');
  assert.equal(u.title, 'Take back your note on session 2 of Maths lessons');
  assert.match(u.summary, /counts as held again/);
  assert.deepEqual(u.payload, { workId: 'w_1', k: 0, n: 2 });
  assert.deepEqual(executorRoutes.work_unflag!({ workId: 'w_1', k: 0, n: 2 }), { method: 'POST', path: '/api/work/w_1/unflag', body: { k: 0, n: 2 } });
});

test('approving and objecting count sessions', () => {
  assert.equal(buildWorkApproveConfirm(lessons, { k: 0, minutes: 9, netMicros: '223875000' }).title, 'Approve 9 sessions of month 1 on Maths lessons');
  assert.equal(buildWorkApproveConfirm(retainer, { k: 1, minutes: 1, netMicros: '1' }).title, 'Approve month 2 on Bookkeeping');
  const o = buildWorkObjectConfirm(lessons, { k: 0, minutes: 1, reason: 'Nobody came on the 9th' });
  assert.equal(o.title, 'Say 1 session on Maths lessons did not happen');
  assert.deepEqual(o.fields[0], { label: 'Sessions you object to', value: '1' });
});

test('the posting card shows sessions a month, on monthly work only', () => {
  const m = buildWorkRequestPostConfirm({ kind: 'monthly', title: 'Maths lessons', brief: 'b', maxRateUsdc: '300', periods: 3, sessions: 12 });
  assert.ok(m.fields.some((f) => f.label === 'Sessions a month' && f.value === '12'));
  const h = buildWorkRequestPostConfirm({ kind: 'hourly', title: 'VA', brief: 'b', maxRateUsdc: '15', maxHours: 20, periods: 4, sessions: 12 });
  assert.ok(!h.fields.some((f) => f.label === 'Sessions a month'));
});

test('a chat channel sends the flag and the session link to the work page\'s own routes', () => {
  assert.deepEqual(executorRoutes.work_flag!({ workId: 'w_1', k: 0, n: 2, note: 'Nobody came' }), { method: 'POST', path: '/api/work/w_1/flag', body: { k: 0, n: 2, note: 'Nobody came' } });
  assert.deepEqual(executorRoutes.work_hours!({ workId: 'w_1', minutes: 1, note: 'Fractions', link: 'https://example.com/rec' }), { method: 'POST', path: '/api/work/w_1/hours', body: { minutes: 1, note: 'Fractions', link: 'https://example.com/rec' } });
});
