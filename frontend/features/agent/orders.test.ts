import assert from 'node:assert/strict';
import test from 'node:test';
import type { StandingOrder } from '@/core/api';
import { agentOrdersCopy, type AgentOrdersCopy } from '@/shared/i18n/messages/agentOrders';
import { EMPTY_DRAFT, canAdd, canStart, changeBody, dayText, orderRows, orderValue, startBody, untilAt, type OrderText } from './orders';

const NOW = Date.UTC(2026, 10, 16, 12);
const DAY = 86_400_000;
const copy = agentOrdersCopy.en;

const order = (over: Partial<StandingOrder> = {}): StandingOrder => ({
  id: 'so_1', side: 'buy', need: 'Buy rice, 50 kg bags', budgetUsdc: '44.57', said: { currency: 'NGN', amount: 60_000 }, kind: 'goods', perDay: 5, until: NOW + 4 * DAY,
  state: 'on', jobId: null, findId: null, createdAt: NOW, askedToday: 3, week: { asked: 9, offers: 2, locked: 0 }, waitsFor: null, ...over,
});
const text: OrderText = {
  amount: (o) => (o.said ? `₦${o.said.amount.toLocaleString('en-US')}` : `${o.budgetUsdc} USDC`),
  date: () => 'Fri 20 Nov',
  city: 'Abuja',
  comma: ', ',
};

test('a row says what the order is, its limit and end, and what it did today', () => {
  const rows = orderRows([order(), order({ id: 'so_2', side: 'sell', need: 'Customers for my catering', budgetUsdc: null, said: undefined, until: null, state: 'paused' })], copy, text);
  assert.deepEqual(rows, [
    { id: 'so_1', title: 'Buy rice, 50 kg bags', line: 'Up to ₦60,000 each, until Fri 20 Nov', value: '3 asked today' },
    { id: 'so_2', title: 'Customers for my catering', line: 'In Abuja, until you stop it', value: 'Paused' },
  ]);
});

test('a budget kept in USDC reads as money, and a seller with no city set reads their usual price', () => {
  assert.equal(orderRows([order({ said: undefined })], copy, text)[0]!.line, 'Up to 44.57 USDC each, until Fri 20 Nov');
  assert.equal(orderRows([order({ side: 'sell', budgetUsdc: null, until: null })], copy, { ...text, city: null })[0]!.line, 'At your usual price, until you stop it');
});

test('the value names what the order waits for before what it asked', () => {
  assert.equal(orderValue(order({ waitsFor: 'location' }), copy), 'Needs your area');
  assert.equal(orderValue(order({ waitsFor: 'money' }), copy), 'Needs money');
  assert.equal(orderValue(order({ state: 'done', waitsFor: 'money' }), copy), 'Done');
  assert.equal(orderValue(order({ state: 'ended' }), copy), 'Ended');
  assert.equal(orderValue(order({ askedToday: 0 }), copy), '0 asked today');
});

test('a sixth order cannot be added; finished ones do not count', () => {
  const five = [1, 2, 3, 4, 5].map((n) => order({ id: `so_${n}` }));
  assert.equal(canAdd(five, 5), false);
  assert.equal(canAdd([...five.slice(0, 4), order({ state: 'done' })], 5), true);
  assert.equal(canAdd([], 5), true);
});

test('an order starts with words and, when buying, a figure', () => {
  assert.equal(canStart(EMPTY_DRAFT), false);
  assert.equal(canStart({ ...EMPTY_DRAFT, need: 'Rice, 50 kg bags' }), false);
  assert.equal(canStart({ ...EMPTY_DRAFT, need: 'Rice, 50 kg bags', budgetUsdc: 0 }), false);
  assert.equal(canStart({ ...EMPTY_DRAFT, need: 'Rice, 50 kg bags', budgetUsdc: 44.57 }), true);
  assert.equal(canStart({ ...EMPTY_DRAFT, need: 'ab', budgetUsdc: 44.57 }), false);
  assert.equal(canStart({ ...EMPTY_DRAFT, need: 'x'.repeat(201), budgetUsdc: 44.57 }), false);
  assert.equal(canStart({ ...EMPTY_DRAFT, side: 'sell', need: 'Customers for my catering' }), true);
});

test('what starting sends: the figure as typed, no date for until you stop it, no budget when selling', () => {
  const draft = { ...EMPTY_DRAFT, need: '  Rice, 50 kg bags ', budgetUsdc: 44.57, untilDays: 4 };
  assert.deepEqual(startBody(draft, { currency: 'NGN', amount: '60000' }), {
    side: 'buy', need: 'Rice, 50 kg bags', budgetUsdc: 44.57, said: { currency: 'NGN', amount: 60_000 }, kind: 'goods', perDay: 5, untilDays: 4,
  });
  assert.deepEqual(startBody({ ...draft, untilDays: 0 }, null), { side: 'buy', need: 'Rice, 50 kg bags', budgetUsdc: 44.57, kind: 'goods', perDay: 5 });
  assert.deepEqual(startBody({ ...draft, side: 'sell', kind: 'in_person' }, { currency: 'NGN', amount: '60000' }), {
    side: 'sell', need: 'Rice, 50 kg bags', budgetUsdc: null, kind: 'in_person', perDay: 5, untilDays: 4,
  });
  assert.equal(untilAt(0, NOW), null);
  assert.equal(untilAt(4, NOW), NOW + 4 * DAY);
});

test('a day reads weekday, day, month', () => {
  assert.equal(dayText(Date.UTC(2026, 10, 20, 12), 'en'), 'Fri 20 Nov');
});

test('saving an open order sends only what changed', () => {
  const o = order();
  assert.equal(changeBody(o, { budgetUsdc: 44.57, perDay: 5, untilDays: undefined }, null), null);
  assert.deepEqual(changeBody(o, { budgetUsdc: 30, perDay: 5, untilDays: undefined }, { currency: 'NGN', amount: '40000' }), { budgetUsdc: 30, said: { currency: 'NGN', amount: 40_000 } });
  assert.deepEqual(changeBody(o, { budgetUsdc: 44.57, perDay: 2, untilDays: 7 }, null), { perDay: 2, untilDays: 7 });
  assert.deepEqual(changeBody(o, { budgetUsdc: 44.57, perDay: 5, untilDays: 0 }, null), { until: null });
  assert.equal(changeBody(order({ until: null }), { budgetUsdc: 44.57, perDay: 5, untilDays: 0 }, null), null);
  assert.equal(changeBody(order({ side: 'sell', budgetUsdc: null }), { budgetUsdc: 9, perDay: 5, untilDays: undefined }, null), null);
});

test('every language has every line, with its figures, and none carries a long dash', () => {
  const flat = (c: AgentOrdersCopy): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(c)) {
      if (typeof v === 'string') out[k] = v;
      else for (const [k2, v2] of Object.entries(v as Record<string, string>)) out[`${k}.${k2}`] = v2;
    }
    return out;
  };
  const en = flat(agentOrdersCopy.en);
  const slots = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    const other = flat(agentOrdersCopy[locale]);
    assert.deepEqual(Object.keys(other).sort(), Object.keys(en).sort(), locale);
    for (const [key, value] of Object.entries(other)) {
      assert.ok(value.trim().length > 0, `${locale} ${key}`);
      assert.equal(slots(value), slots(en[key]!), `${locale} ${key} keeps its figures`);
      assert.ok(!/[—–]/.test(value), `${locale} ${key}`);
    }
  }
  for (const value of Object.values(en)) assert.ok(!/[—–]/.test(value));
});
