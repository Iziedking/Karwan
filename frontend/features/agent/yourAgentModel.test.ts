import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '@/core/api';
import type { AgentWays } from '@/features/profile/ways';
import { paidKindOf, priceProblem, sellerUsualGiven, withPaid, withPrice } from './yourAgentModel';

/// The Your agent page (view 45): one row per question, each change saved
/// through the ways the server keeps.
///
///   npx tsx --test features/agent/yourAgentModel.test.ts

const seller = { skills: ['logo design'], bio: '', minBudgetUsdc: 10, maxBudgetUsdc: 20000, minDeadlineDays: 1, maxDeadlineDays: 3 };

test('a usual price counts only when the person gave it', () => {
  assert.equal(sellerUsualGiven({ seller } as UserProfile), false);
  assert.equal(sellerUsualGiven({ seller: { ...seller, usualSet: true } } as UserProfile), true);
  const carried = { seller, agentWays: { sell: [{ shape: 'one_time', priceMin: 10, priceMax: 100, daysMin: 1, daysMax: 3 }], buy: [] } } as unknown as UserProfile;
  assert.equal(sellerUsualGiven(carried), false);
  const given = { seller, agentWays: { sell: [{ shape: 'one_time', priceMin: 10, priceUsual: 60, daysMin: 1, daysMax: 3 }], buy: [] } } as unknown as UserProfile;
  assert.equal(sellerUsualGiven(given), true);
  assert.equal(sellerUsualGiven({} as UserProfile), true, 'no seller, nothing to ask');
});

test('the price is set on the first priced way and becomes the person\'s own', () => {
  const ways: AgentWays = {
    sell: [
      { shape: 'deposit', what: 'Camera', deposit: 200, periodDays: 7 },
      { shape: 'one_time', priceMin: 10, priceUsual: 10005, usualGuessed: true, daysMin: 1, daysMax: 3 },
    ],
    buy: [],
  };
  const next = withPrice(ways, { lowest: 30, usual: 50 });
  assert.deepEqual(next.sell[0], ways.sell[0]);
  assert.deepEqual(next.sell[1], { shape: 'one_time', priceMin: 30, priceUsual: 50, daysMin: 1, daysMax: 3 });
});

test('a price is checked before it is saved', () => {
  assert.equal(priceProblem(30, 50), null);
  assert.equal(priceProblem(50, 50), null);
  assert.equal(priceProblem(60, 50), 'order');
  assert.equal(priceProblem(0, 50), 'missing');
  assert.equal(priceProblem(Number.NaN, 50), 'missing');
});

test('how you get paid changes the kind and keeps the price and days', () => {
  const ways: AgentWays = { sell: [{ shape: 'one_time', priceMin: 30, priceUsual: 50, daysMin: 1, daysMax: 3 }], buy: [] };
  assert.equal(paidKindOf(ways), 'one_time');
  const stages = withPaid(ways, { kind: 'milestones', daysMin: 2, daysMax: 9 });
  assert.deepEqual(stages.sell, [{ shape: 'milestones', priceMin: 30, priceUsual: 50, daysMin: 2, daysMax: 9, stages: 2 }]);
  const goods = withPaid(ways, { kind: 'goods', daysMin: 2, daysMax: 5, what: 'Shoes', shipsTo: 'Lagos' });
  assert.deepEqual(goods.sell, [{ shape: 'goods', what: 'Shoes', priceMin: 30, priceUsual: 50, perItem: true, shipsTo: 'Lagos', arriveDaysMin: 2, arriveDaysMax: 5 }]);
  assert.equal(paidKindOf(goods), 'goods');
});

test('choosing a kind already listed replaces it, never two of one kind', () => {
  const ways: AgentWays = {
    sell: [
      { shape: 'one_time', priceMin: 30, priceUsual: 50, daysMin: 1, daysMax: 3 },
      { shape: 'milestones', priceMin: 100, priceUsual: 400, daysMin: 7, daysMax: 30, stages: 3 },
    ],
    buy: [],
  };
  const next = withPaid(ways, { kind: 'milestones', daysMin: 2, daysMax: 9 });
  assert.equal(next.sell.length, 1);
  assert.deepEqual(next.sell[0], { shape: 'milestones', priceMin: 30, priceUsual: 50, daysMin: 2, daysMax: 9, stages: 3 });
});

test('changing how you get paid never turns a carried-over price into yours', () => {
  const ways: AgentWays = { sell: [{ shape: 'one_time', priceMin: 10, priceUsual: 10005, usualGuessed: true, daysMin: 1, daysMax: 3 }], buy: [] };
  const next = withPaid(ways, { kind: 'milestones', daysMin: 2, daysMax: 9 });
  assert.equal((next.sell[0] as { usualGuessed?: boolean }).usualGuessed, true);
});

test('the price panel keeps the figures typed, and leaves an untouched one as it was (view 77)', async () => {
  const { withPrice } = await import('./yourAgentModel');
  const ways = { sell: [{ shape: 'one_time' as const, priceMin: 20, priceUsual: 40, daysMin: 1, daysMax: 7 }], buy: [] };
  const typed = withPrice(ways, { lowest: 22.29, usual: 40 }, { lowest: { currency: 'NGN', amount: '30000' } });
  assert.deepEqual((typed.sell[0] as { said?: unknown }).said, { currency: 'NGN', amounts: { priceMin: { amount: '30000' } } });
  const again = withPrice(typed, { lowest: 22.29, usual: 44.57 }, { usual: { currency: 'NGN', amount: '60000' } });
  assert.deepEqual(Object.keys((again.sell[0] as unknown as { said: { amounts: object } }).said.amounts), ['priceMin', 'priceUsual']);
  assert.equal('said' in withPrice(ways, { lowest: 20, usual: 40 }).sell[0]!, false);
});
