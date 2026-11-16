import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  afterRequestEvent, changedOrder, claimDueOrders, deleteOrdersOf, liveCount, MAX_ORDERS, newOrder, nextRunAt, orderByJob, orderOf, ordersOf,
  paused, removeOrder, resetOrdersForTests, resumed, rolled, saveOrder, saveRun, validateOrder, type OrderInput, type StandingOrder,
} from './orders.js';

/// Standing orders (view 87, step 4), on the memory store the tests use.
///
///   node ../scripts/run-tests.mjs src/find/orders.test.ts

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 16, 12);

beforeEach(() => resetOrdersForTests());

const rice: OrderInput = { side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: 40, kind: 'goods' };

function order(n: number, over: Partial<StandingOrder> = {}): StandingOrder {
  const v = validateOrder(rice, 0, NOW);
  assert.ok(v.ok);
  return { ...newOrder('0xBUYER', v.order, `o${n}`, NOW + n, 12, '2026-11-16'), ...over };
}

test('an order needs words, a budget when buying, one to five people a day and a date ahead', () => {
  const ok = validateOrder(rice, 0, NOW);
  assert.ok(ok.ok);
  assert.deepEqual(ok.order, { side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: '40', kind: 'goods', where: { scope: 'near' }, perDay: 5, until: null });

  const refused = (input: OrderInput, code: string, live = 0) => assert.deepEqual(validateOrder(input, live, NOW), { ok: false, code });
  refused({ ...rice, need: ' a ' }, 'need');
  refused({ ...rice, need: 'x'.repeat(201) }, 'need');
  refused({ ...rice, budgetUsdc: null }, 'budget');
  refused({ ...rice, budgetUsdc: 0 }, 'budget');
  refused({ ...rice, budgetUsdc: 5_000_001 }, 'budget');
  refused({ ...rice, perDay: 0 }, 'perDay');
  refused({ ...rice, perDay: 6 }, 'perDay');
  refused({ ...rice, perDay: 2.5 }, 'perDay');
  refused({ ...rice, until: NOW }, 'until');
  refused({ ...rice, until: NOW + 91 * DAY }, 'until');
  refused(rice, 'too-many', MAX_ORDERS);
});

test('a selling order has no budget, and a budget worked out from another currency is kept in cents', () => {
  const sell = validateOrder({ side: 'sell', need: 'Tailoring', budgetUsdc: 99, kind: 'in_person', said: { currency: 'NGN', amount: 1 } }, 0, NOW);
  assert.ok(sell.ok);
  assert.equal(sell.order.budgetUsdc, null);
  assert.equal(sell.order.said, undefined);

  const buy = validateOrder({ ...rice, budgetUsdc: 36.123456, said: { currency: 'NGN', amount: 60_000 } }, 0, NOW);
  assert.ok(buy.ok);
  assert.equal(buy.order.budgetUsdc, '36.12');
  assert.deepEqual(buy.order.said, { currency: 'NGN', amount: 60_000 });
});

test('a new order is due at once and is its owner\'s alone', async () => {
  await saveOrder(order(1));
  await saveOrder(order(2, { owner: '0xother' }));
  assert.deepEqual((await ordersOf('0xBuyer', NOW)).map((o) => o.id), ['o1']);
  assert.equal((await orderOf('0xbuyer', 'o1'))?.nextAt, NOW + 1);
  assert.equal(await orderOf('0xbuyer', 'o2'), null);
  assert.equal(await removeOrder('0xbuyer', 'o2'), false);
  assert.equal(await removeOrder('0xother', 'o2'), true);
});

test('a finished order stays listed for a week and does not count toward five', async () => {
  await saveOrder(order(1));
  await saveOrder(order(2, { state: 'done', endedAt: NOW }));
  await saveOrder(order(3, { state: 'ended', endedAt: NOW - 8 * DAY }));
  const mine = await ordersOf('0xbuyer', NOW + DAY);
  assert.deepEqual(mine.map((o) => o.id), ['o1', 'o2']);
  assert.equal(liveCount(mine), 1);
});

test('two sweeps at the same moment: each due order is claimed once, with its next run set', async () => {
  await saveOrder(order(1));
  await saveOrder(order(2));
  await saveOrder(order(3, { state: 'paused' }));
  await saveOrder(order(4, { nextAt: NOW + DAY }));
  const next = async () => NOW + DAY;
  const [a, b] = await Promise.all([claimDueOrders(NOW + 10, next), claimDueOrders(NOW + 10, next)]);
  assert.deepEqual([...a, ...b].map((o) => o.id).sort(), ['o1', 'o2']);
  assert.equal((await orderOf('0xbuyer', 'o1'))?.nextAt, NOW + DAY);
  assert.deepEqual(await claimDueOrders(NOW + 10, next), []);
});

test('the next run is tomorrow at the order\'s hour, moved out of quiet hours', () => {
  // 12:00 UTC is 13:00 in Lagos.
  assert.equal(nextRunAt({ runAtHour: 13 }, NOW, 'Africa/Lagos', { from: 21, to: 7 }), NOW + DAY);
  // Started at 23:00 Lagos time: tomorrow's 23:00 is quiet, so it moves to 07:00 the day after.
  const late = Date.UTC(2026, 10, 16, 22);
  assert.equal(nextRunAt({ runAtHour: 23 }, late, 'Africa/Lagos', { from: 21, to: 7 }), Date.UTC(2026, 10, 18, 6));
  assert.equal(nextRunAt({ runAtHour: 23 }, late, 'Africa/Lagos', null), late + DAY);
});

test('today\'s count starts over on a new day, the week\'s after seven days', () => {
  const o = order(1, { today: { day: '2026-11-16', asked: 3 }, week: { asked: 9, offers: 2, locked: 0, since: NOW } });
  assert.equal(rolled(o, NOW + HOUR, '2026-11-16'), o);
  assert.deepEqual(rolled(o, NOW + DAY, '2026-11-17').today, { day: '2026-11-17', asked: 0 });
  assert.equal(rolled(o, NOW + DAY, '2026-11-17').week.asked, 9);
  assert.deepEqual(rolled(o, NOW + 7 * DAY, '2026-11-23').week, { asked: 0, offers: 0, locked: 0, since: NOW + 7 * DAY });
});

test('pause keeps the order and stops its runs; resume runs it at once', async () => {
  const o = paused(order(1));
  assert.equal(o.state, 'paused');
  await saveOrder(o);
  assert.deepEqual(await claimDueOrders(NOW + DAY, async () => 0), []);
  const back = resumed(o, NOW + 2 * DAY);
  assert.equal(back.state, 'on');
  assert.equal(back.nextAt, NOW + 2 * DAY);
  assert.equal(resumed(order(2, { state: 'done' }), NOW).state, 'done');
});

test('a pause made while a run was working is not undone by the run', async () => {
  const o = order(1);
  await saveOrder(paused(o));
  const saved = await saveRun({ ...o, today: { day: '2026-11-16', asked: 3 } });
  assert.equal(saved?.state, 'paused');
  assert.equal(saved?.today.asked, 3);
  await removeOrder('0xbuyer', 'o1');
  assert.equal(await saveRun(o), null);
});

test('a change takes a new budget, date or people a day, and refuses a bad one', () => {
  const o = order(1, { said: { currency: 'NGN', amount: 60_000 } });
  const lower = changedOrder(o, { budgetUsdc: 30 }, NOW);
  assert.ok(lower.ok);
  assert.equal(lower.order.budgetUsdc, '30');
  assert.equal(lower.order.said, undefined);
  const more = changedOrder(o, { perDay: 2, until: NOW + 3 * DAY }, NOW);
  assert.ok(more.ok);
  assert.equal(more.order.perDay, 2);
  assert.equal(more.order.until, NOW + 3 * DAY);
  assert.deepEqual(changedOrder(o, { budgetUsdc: 0 }, NOW), { ok: false, code: 'budget' });
  assert.deepEqual(changedOrder(o, { perDay: 9 }, NOW), { ok: false, code: 'perDay' });
  assert.deepEqual(changedOrder(o, { until: NOW - 1 }, NOW), { ok: false, code: 'until' });
  assert.deepEqual(changedOrder(order(2, { side: 'sell', budgetUsdc: null }), { budgetUsdc: 5 }, NOW), { ok: false, code: 'budget' });
});

test('an offer is counted, a locked deal finishes the order, a request that ended frees it for a fresh find', async () => {
  const o = order(1, { findId: 'f1', jobId: '0xJOB' });
  await saveOrder(o);
  assert.equal((await orderByJob('0xjob'))?.id, 'o1');
  assert.equal(await orderByJob('0xnone'), null);
  const offered = afterRequestEvent(o, 'offer', NOW, '0xNgozi');
  assert.equal(offered.week.offers, 1);
  assert.equal(afterRequestEvent(offered, 'offer', NOW, '0xngozi'), offered, 'the same seller is counted once');
  assert.equal(afterRequestEvent(offered, 'offer', NOW, '0xamaka').week.offers, 2);
  assert.equal(afterRequestEvent(o, 'offer', NOW), o);
  const done = afterRequestEvent(o, 'locked', NOW + 5);
  assert.equal(done.state, 'done');
  assert.equal(done.endedAt, NOW + 5);
  assert.equal(done.week.locked, 1);
  assert.equal(afterRequestEvent(done, 'locked', NOW + 9), done, 'a second server reading the same event changes nothing');
  const freed = afterRequestEvent(offered, 'closed', NOW);
  assert.equal(freed.offerers, undefined);
  assert.equal(freed.state, 'on');
  assert.equal(freed.findId, null);
  assert.equal(freed.jobId, null);
});

test('deleting an account clears its orders', async () => {
  await saveOrder(order(1));
  await saveOrder(order(2, { owner: '0xother' }));
  await deleteOrdersOf('0xBUYER');
  assert.deepEqual(await ordersOf('0xbuyer', NOW), []);
  assert.equal((await ordersOf('0xother', NOW)).length, 1);
});
