import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import { fittingWay, legacyFromWays, LIVE_SHAPES, reconcileWays, sellerForRequest, waysOf, withWay, waysSchema, wayLines, withWayLimits, type AgentWays } from './ways.js';

/// The ways a person deals (view 26): one per escrow shape, in plain answers,
/// read by the selling agent to match and by the account to stay in step.
///
///   npx tsx --test src/agents/ways.test.ts

const legacy = {
  address: '0xowner', role: 'both', displayName: 'Ada', createdAt: 0, updatedAt: 0,
  seller: { skills: ['logo'], bio: 'Logos', minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 3, keywords: ['logo'] },
  buyer: { maxBudgetUsdc: 300, minDeadlineDays: 1, maxDeadlineDays: 14, bidCollectionSeconds: 45, milestonePcts: [50, 50] },
} as unknown as UserProfile;

const ways: AgentWays = {
  sell: [
    { shape: 'one_time', priceMin: 20, priceMax: 40, daysMin: 1, daysMax: 3 },
    { shape: 'goods', what: 'Wigs', priceMin: 80, priceMax: 300, shipsTo: 'Anywhere in Nigeria', arriveDaysMin: 2, arriveDaysMax: 5 },
  ],
  buy: [{ shape: 'milestones', maxPrice: 500, needDays: 21, pay: 'stages' }],
};

test('only the shapes the live escrow holds are offered', () => {
  assert.deepEqual([...LIVE_SHAPES], ['one_time', 'milestones', 'goods', 'deposit']);
  assert.equal(waysSchema.safeParse({ sell: [{ shape: 'hourly', rate: 8 }], buy: [] }).success, false);
});

test('answers are checked per shape', () => {
  assert.equal(waysSchema.safeParse(ways).success, true);
  const backwards = { sell: [{ shape: 'one_time', priceMin: 50, priceMax: 20, daysMin: 1, daysMax: 3 }], buy: [] };
  assert.equal(waysSchema.safeParse(backwards).success, false);
  const twice = { sell: [ways.sell[0], ways.sell[0]], buy: [] };
  assert.equal(waysSchema.safeParse(twice).success, false);
  const noPlace = { sell: [{ ...ways.sell[1], shipsTo: '' }], buy: [] };
  assert.equal(waysSchema.safeParse(noPlace).success, false);
});

test('an account that never saved ways reads them from its settings', () => {
  const read = waysOf(legacy);
  assert.deepEqual(read.sell, [{ shape: 'one_time', priceMin: 20, priceMax: 40, daysMin: 1, daysMax: 3 }]);
  assert.deepEqual(read.buy, [{ shape: 'milestones', maxPrice: 300, needDays: 14, pay: 'stages' }]);
  assert.equal(read.saved, false);
  assert.equal(waysOf({ ...legacy, agentWays: ways } as UserProfile).saved, true);
});

test('a request is matched to the way of its shape', () => {
  assert.equal(fittingWay(ways.sell, 'goods')?.shape, 'goods');
  assert.equal(fittingWay(ways.sell, 'service')?.shape, 'one_time');
  assert.equal(fittingWay(ways.sell, undefined)?.shape, 'one_time');
  assert.equal(fittingWay([ways.sell[1]!], 'service'), null);
  assert.equal(fittingWay([{ shape: 'milestones', priceMin: 100, priceMax: 900, daysMin: 7, daysMax: 30, stages: 3 }], 'mixed')?.shape, 'milestones');
});

test('the agent bids inside the fitting way, not the account-wide range', () => {
  const seller = { minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 3 };
  assert.deepEqual(withWayLimits(seller, ways.sell[1]!), { minBudgetUsdc: 80, maxBudgetUsdc: 300, minDeadlineDays: 2, maxDeadlineDays: 5 });
});

test('saving ways keeps the older settings in step', () => {
  const next = legacyFromWays(ways, legacy);
  assert.equal(next.seller?.minBudgetUsdc, 20);
  assert.equal(next.seller?.maxBudgetUsdc, 300);
  assert.equal(next.seller?.maxDeadlineDays, 5);
  assert.equal(next.seller?.tradeType, 'both');
  assert.equal(next.seller?.bio, 'Logos');
  assert.equal(next.buyer?.maxBudgetUsdc, 500);
  assert.deepEqual(next.buyer?.milestonePcts, [50, 50]);
  const goodsOnly = legacyFromWays({ sell: [ways.sell[1]!], buy: [] }, legacy);
  assert.equal(goodsOnly.seller?.tradeType, 'goods');
});

test('each way reads as one plain line', () => {
  assert.deepEqual(wayLines(ways), [
    'Selling, one-time: 20 to 40 USDC, done in 1 to 3 days',
    'Selling, goods with delivery: Wigs, 80 to 300 USDC, to Anywhere in Nigeria, arrives in 2 to 5 days',
    'Buying, milestones: up to 500 USDC, within 21 days, paid stage by stage',
  ]);
});

test('the Edit profile form and saved ways never differ', () => {
  const seller = { ...legacy.seller!, minBudgetUsdc: 30, maxBudgetUsdc: 60, minDeadlineDays: 2, maxDeadlineDays: 4 };
  const next = reconcileWays(ways, seller, legacy.buyer);
  assert.deepEqual(next.sell[0], { shape: 'one_time', priceMin: 30, priceMax: 60, daysMin: 2, daysMax: 4 });
  assert.deepEqual(next.sell[1], ways.sell[1]);
  assert.deepEqual(next.buy[0], { shape: 'milestones', maxPrice: 300, needDays: 14, pay: 'stages' });
  assert.deepEqual(reconcileWays(ways, undefined, legacy.buyer).sell, []);
});

test('a request of a shape the seller does not offer goes to the owner', () => {
  const seller = { minBudgetUsdc: 20, maxBudgetUsdc: 300, minDeadlineDays: 1, maxDeadlineDays: 5, agentMode: 'offers' as const };
  assert.deepEqual(sellerForRequest(seller, 'goods'), seller);
  const withWays = { ...seller, ways: [ways.sell[1]!] };
  assert.equal(sellerForRequest(withWays, 'goods').minBudgetUsdc, 80);
  assert.equal(sellerForRequest(withWays, 'goods').agentMode, 'offers');
  assert.equal(sellerForRequest(withWays, 'service').agentMode, 'ask');
});

test('one way changes at a time, in place', () => {
  const cheaper = { shape: 'goods' as const, what: 'Wigs', priceMin: 60, priceMax: 250, shipsTo: 'Lagos', arriveDaysMin: 1, arriveDaysMax: 3 };
  const next = withWay(ways, 'sell', 'goods', cheaper);
  assert.deepEqual(next.sell.map((w) => w.shape), ['one_time', 'goods']);
  assert.equal(next.sell[1], cheaper);
  assert.deepEqual(withWay(ways, 'sell', 'one_time', null).sell.map((w) => w.shape), ['goods']);
  assert.deepEqual(withWay(ways, 'buy', 'deposit', { shape: 'deposit', maxDeposit: 100 }).buy.map((w) => w.shape), ['milestones', 'deposit']);
});
