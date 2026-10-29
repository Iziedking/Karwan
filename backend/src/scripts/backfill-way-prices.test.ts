import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';

delete process.env.DATABASE_URL;
const { planWayPriceBackfill } = await import('./backfill-way-prices.js');

///   npx tsx --test src/scripts/backfill-way-prices.test.ts

const profile = (address: string, agentWays: unknown): UserProfile =>
  ({
    address,
    role: 'both',
    displayName: address,
    createdAt: 0,
    updatedAt: 0,
    seller: { skills: ['wigs'], bio: 'Wigs', minBudgetUsdc: 1, maxBudgetUsdc: 1, minDeadlineDays: 1, maxDeadlineDays: 1 },
    ...(agentWays === undefined ? {} : { agentWays }),
  }) as unknown as UserProfile;

const old = {
  sell: [
    { shape: 'goods', what: 'Wigs', priceMin: 80, priceMax: 300, shipsTo: 'Nigeria', arriveDaysMin: 2, arriveDaysMax: 5 },
    { shape: 'one_time', priceMin: 25, priceMax: 25, daysMin: 1, daysMax: 3 },
  ],
  buy: [{ shape: 'one_time', maxPrice: 200, needDays: 7 }],
};

test('a saved range becomes lowest and usual; one price is both; buying ways are untouched', () => {
  const plan = planWayPriceBackfill([profile('0xa', old)]);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0]!.after, {
    sell: [
      { shape: 'goods', what: 'Wigs', priceMin: 80, priceUsual: 190, shipsTo: 'Nigeria', arriveDaysMin: 2, arriveDaysMax: 5 },
      { shape: 'one_time', priceMin: 25, priceUsual: 25, daysMin: 1, daysMax: 3 },
    ],
    buy: [{ shape: 'one_time', maxPrice: 200, needDays: 7 }],
  });
  assert.equal(plan[0]!.seller?.minBudgetUsdc, 25);
  assert.equal(plan[0]!.seller?.maxBudgetUsdc, 190);
});

test('running it again changes nothing, and profiles without ways are left out', () => {
  const first = planWayPriceBackfill([profile('0xa', old), profile('0xb', undefined)]);
  assert.equal(first.length, 1);
  const again = planWayPriceBackfill([profile('0xa', first[0]!.after)]);
  assert.deepEqual(again, []);
});

test('ways that cannot be read after the upgrade are skipped, not written', () => {
  const broken = { sell: [{ shape: 'goods', what: '', priceMin: 80, priceMax: 300, shipsTo: 'Nigeria', arriveDaysMin: 2, arriveDaysMax: 5 }], buy: [] };
  assert.deepEqual(planWayPriceBackfill([profile('0xc', broken)]), []);
});
