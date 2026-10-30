import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import { fittingWay, legacyFromWays, LIVE_SHAPES, reconcileWays, sellerForRequest, sellWaySchema, timeOffer, upgradeWays, usualOf, waysOf, withWay, waysSchema, wayLines, withWayLimits, type AgentWays } from './ways.js';

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
    { shape: 'one_time', priceMin: 20, priceUsual: 30, daysMin: 1, daysMax: 3 },
    { shape: 'goods', what: 'Wigs', priceMin: 80, priceUsual: 190, shipsTo: 'Anywhere in Nigeria', arriveDaysMin: 2, arriveDaysMax: 5 },
  ],
  buy: [{ shape: 'milestones', maxPrice: 500, needDays: 21, pay: 'stages' }],
};

test('only the shapes the live escrow holds are offered', () => {
  assert.deepEqual([...LIVE_SHAPES], ['one_time', 'milestones', 'goods', 'deposit']);
  assert.equal(waysSchema.safeParse({ sell: [{ shape: 'hourly', rate: 8 }], buy: [] }).success, false);
});

test('answers are checked per shape', () => {
  assert.equal(waysSchema.safeParse(ways).success, true);
  const backwards = { sell: [{ shape: 'one_time', priceMin: 50, priceUsual: 20, daysMin: 1, daysMax: 3 }], buy: [] };
  assert.equal(waysSchema.safeParse(backwards).success, false);
  // A selling way has a lowest and a usual price and no highest (view 41).
  const highest = { sell: [{ shape: 'one_time', priceMin: 20, priceMax: 40, daysMin: 1, daysMax: 3 }], buy: [] };
  assert.equal(waysSchema.safeParse(highest).success, false);
  const parsed = sellWaySchema.parse({ shape: 'one_time', priceMin: 20, priceUsual: 30, priceMax: 40, daysMin: 1, daysMax: 3 });
  assert.equal('priceMax' in parsed, false);
  const twice = { sell: [ways.sell[0], ways.sell[0]], buy: [] };
  assert.equal(waysSchema.safeParse(twice).success, false);
  const noPlace = { sell: [{ ...ways.sell[1], shipsTo: '' }], buy: [] };
  assert.equal(waysSchema.safeParse(noPlace).success, false);
});

test('ways saved with a range become lowest and usual, once', () => {
  const old = {
    sell: [
      { shape: 'one_time', priceMin: 20, priceMax: 40, daysMin: 1, daysMax: 3 },
      { shape: 'goods', what: 'Wigs', priceMin: 80, priceMax: 80, shipsTo: 'Lagos', arriveDaysMin: 2, arriveDaysMax: 5 },
      { shape: 'deposit', what: 'Camera', deposit: 200, periodDays: 7 },
    ],
    buy: [{ shape: 'one_time', maxPrice: 200, needDays: 7 }],
  };
  const upgraded = upgradeWays(old);
  assert.deepEqual(upgraded.sell, [
    { shape: 'one_time', priceMin: 20, priceUsual: 30, daysMin: 1, daysMax: 3 },
    { shape: 'goods', what: 'Wigs', priceMin: 80, priceUsual: 80, shipsTo: 'Lagos', arriveDaysMin: 2, arriveDaysMax: 5 },
    { shape: 'deposit', what: 'Camera', deposit: 200, periodDays: 7 },
  ]);
  assert.deepEqual(upgraded.buy, old.buy);
  assert.deepEqual(upgradeWays(upgraded), upgraded);
  assert.equal(waysSchema.safeParse(upgraded).success, true);
  assert.equal(usualOf(20, 40), 30);
  assert.equal(usualOf(25, 25), 25);
  assert.equal(usualOf(10, 15), 12.5);
  const saved = waysOf({ ...legacy, agentWays: old as unknown as AgentWays } as UserProfile);
  assert.equal((saved.sell[0] as { priceUsual: number }).priceUsual, 30);
});

test('a way can carry the level under which the agent says no politely, never above its lowest', () => {
  const band = { shape: 'one_time' as const, priceMin: 20, priceUsual: 30, noAskBelow: 15, daysMin: 1, daysMax: 3 };
  assert.equal(waysSchema.safeParse({ sell: [band], buy: [] }).success, true);
  assert.equal(waysSchema.safeParse({ sell: [{ ...band, noAskBelow: 25 }], buy: [] }).success, false);
  assert.equal(withWayLimits({ minBudgetUsdc: 1, maxBudgetUsdc: 1, minDeadlineDays: 1, maxDeadlineDays: 1 }, band).noAskBelowUsdc, 15);
  assert.equal(wayLines({ sell: [band], buy: [] })[0], 'Selling, one-time: usually 30 USDC, lowest 20, not asked under 15 USDC, done in 1 to 3 days');
});

test('a goods way can be priced per item, and says so', () => {
  const perItem = { shape: 'goods' as const, what: 'Wigs', priceMin: 80, priceUsual: 190, perItem: true, shipsTo: 'Lagos', arriveDaysMin: 2, arriveDaysMax: 5 };
  assert.equal(waysSchema.safeParse({ sell: [perItem], buy: [] }).success, true);
  assert.equal(withWayLimits({ minBudgetUsdc: 1, maxBudgetUsdc: 1, minDeadlineDays: 1, maxDeadlineDays: 1 }, perItem).pricesPerItem, true);
  assert.equal(withWayLimits({ minBudgetUsdc: 1, maxBudgetUsdc: 1, minDeadlineDays: 1, maxDeadlineDays: 1 }, ways.sell[1]!).pricesPerItem, false);
  assert.equal(wayLines({ sell: [perItem], buy: [] })[0], 'Selling, goods with delivery: Wigs, usually 190 USDC, lowest 80 per item, to Lagos, arrives in 2 to 5 days');
});

test('an account that never saved ways reads them from its settings', () => {
  const read = waysOf(legacy);
  assert.deepEqual(read.sell, [{ shape: 'one_time', priceMin: 20, priceUsual: 30, daysMin: 1, daysMax: 3 }]);
  assert.deepEqual(read.buy, [{ shape: 'milestones', maxPrice: 300, needDays: 14, pay: 'stages' }]);
  assert.equal(read.saved, false);
  assert.equal(waysOf({ ...legacy, agentWays: ways } as UserProfile).saved, true);
});

test('a request is matched to the way of its shape', () => {
  assert.equal(fittingWay(ways.sell, 'goods')?.shape, 'goods');
  assert.equal(fittingWay(ways.sell, 'service')?.shape, 'one_time');
  assert.equal(fittingWay(ways.sell, undefined)?.shape, 'one_time');
  assert.equal(fittingWay([ways.sell[1]!], 'service'), null);
  assert.equal(fittingWay([{ shape: 'milestones', priceMin: 100, priceUsual: 500, daysMin: 7, daysMax: 30, stages: 3 }], 'mixed')?.shape, 'milestones');
});

test('the agent bids inside the fitting way, not the account-wide range', () => {
  const seller = { minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 3 };
  assert.deepEqual(withWayLimits(seller, ways.sell[1]!), { minBudgetUsdc: 80, maxBudgetUsdc: 190, usualPriceUsdc: 190, pricesPerItem: false, minDeadlineDays: 2, maxDeadlineDays: 5 });
});

test('saving ways keeps the older settings in step', () => {
  const next = legacyFromWays(ways, legacy);
  assert.equal(next.seller?.minBudgetUsdc, 20);
  assert.equal(next.seller?.maxBudgetUsdc, 190, 'the highest usual price, never a cap');
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
    'Selling, one-time: usually 30 USDC, lowest 20, done in 1 to 3 days',
    'Selling, goods with delivery: Wigs, usually 190 USDC, lowest 80, to Anywhere in Nigeria, arrives in 2 to 5 days',
    'Buying, milestones: up to 500 USDC, within 21 days, paid stage by stage',
  ]);
});

test('the Edit profile form and saved ways never differ', () => {
  const seller = { ...legacy.seller!, minBudgetUsdc: 30, maxBudgetUsdc: 60, minDeadlineDays: 2, maxDeadlineDays: 4 };
  const next = reconcileWays(ways, seller, legacy.buyer);
  assert.deepEqual(next.sell[0], { shape: 'one_time', priceMin: 30, priceUsual: 60, daysMin: 2, daysMax: 4 });
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
  const cheaper = { shape: 'goods' as const, what: 'Wigs', priceMin: 60, priceUsual: 150, shipsTo: 'Lagos', arriveDaysMin: 1, arriveDaysMax: 3 };
  const next = withWay(ways, 'sell', 'goods', cheaper);
  assert.deepEqual(next.sell.map((w) => w.shape), ['one_time', 'goods']);
  assert.equal(next.sell[1], cheaper);
  assert.deepEqual(withWay(ways, 'sell', 'one_time', null).sell.map((w) => w.shape), ['goods']);
  assert.deepEqual(withWay(ways, 'buy', 'deposit', { shape: 'deposit', maxDeposit: 100 }).buy.map((w) => w.shape), ['milestones', 'deposit']);
});

test('time ways sell by the hour or by the month, and the agent offers inside them (view 32)', () => {
  const parsed = waysSchema.parse({
    sell: [
      { shape: 'hourly', rateMin: 8, rateUsual: 10, hoursMax: 20 },
      { shape: 'monthly', priceMin: 300, priceUsual: 400 },
    ],
    buy: [],
  });
  assert.equal(parsed.sell.length, 2);
  assert.throws(() => waysSchema.parse({ sell: [{ shape: 'hourly', rateMin: 12, rateUsual: 10, hoursMax: 20 }], buy: [] }));
  assert.deepEqual(wayLines(parsed), [
    'Selling, by the hour: usually 10 USDC an hour, lowest 8, up to 20 hours a week',
    'Selling, monthly retainer: usually 400 USDC, lowest 300 a month',
  ]);
  // The usual rate, lowered to the hirer's most, never under the lowest.
  assert.equal(timeOffer(parsed.sell, { kind: 'hourly', mostUsdc: 15, maxHours: 10 }), 10);
  assert.equal(timeOffer(parsed.sell, { kind: 'hourly', mostUsdc: 9, maxHours: 10 }), 9);
  assert.equal(timeOffer(parsed.sell, { kind: 'hourly', mostUsdc: 7, maxHours: 10 }), null);
  assert.equal(timeOffer(parsed.sell, { kind: 'hourly', mostUsdc: 15, maxHours: 30 }), null);
  assert.equal(timeOffer(parsed.sell, { kind: 'monthly', mostUsdc: 350, maxHours: 1 }), 350);
  assert.equal(timeOffer([], { kind: 'hourly', mostUsdc: 15, maxHours: 10 }), null);
  // A time way never sets the price the agent bids on fixed-price work.
  assert.equal(fittingWay(parsed.sell, 'service'), null);
});
