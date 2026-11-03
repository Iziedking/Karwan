import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryOfRequest, isRising, priceBands, weeklyDemand } from './marketStore.js';

/// One market store (view 48, step 4): demand and prices by the market's ten
/// categories, Karwan's own data first.

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const req = (text: string, daysAgo: number, extra: Record<string, unknown> = {}) => ({ briefText: text, keywords: [], createdAt: NOW - daysAgo * DAY, ...extra });

test('a request belongs to the category its words name', () => {
  assert.equal(categoryOfRequest({ briefText: 'Need a logo for my bakery', keywords: [] }), 'design');
  assert.equal(categoryOfRequest({ briefText: 'Supply 2 tonnes', keywords: ['rice'] }), 'farm');
  assert.equal(categoryOfRequest({ briefText: 'Something vague', keywords: ['help'] }), null);
});

test('demand counts requests this week and last, and open offers, per category', () => {
  const rows = weeklyDemand(
    [req('logo design', 1), req('flyer design', 3), req('website build', 2), req('poster design', 9), req('seed logo', 1, { seedKey: 'x' }), req('logo later', -1)],
    [{ title: 'Logo design', description: '', expiresAt: NOW + DAY }, { title: 'Old banner', description: '', expiresAt: NOW - DAY }],
    NOW,
  );
  const design = rows.find((r) => r.id === 'design')!;
  assert.deepEqual(
    { thisWeek: design.thisWeek, lastWeek: design.lastWeek, openOffers: design.openOffers, name: design.name },
    { thisWeek: 2, lastWeek: 1, openOffers: 1, name: 'Design' },
  );
  assert.equal(rows[0]!.id, 'design', 'most requested first');
  assert.equal(rows.find((r) => r.id === 'tech')!.thisWeek, 1);
  assert.equal(rows.some((r) => r.thisWeek === 0 && r.lastWeek === 0 && r.openOffers === 0), false, 'empty categories are left out');
});

test('rising scales with how busy the market is', () => {
  assert.equal(isRising({ thisWeek: 2, lastWeek: 1 }, 6), true, 'a quiet week: one more is enough');
  assert.equal(isRising({ thisWeek: 1, lastWeek: 0 }, 6), false, 'one request is not a trend');
  assert.equal(isRising({ thisWeek: 3, lastWeek: 3 }, 6), false);
  assert.equal(isRising({ thisWeek: 12, lastWeek: 10 }, 60), false, 'a busy week needs a gain of six');
  assert.equal(isRising({ thisWeek: 16, lastWeek: 10 }, 60), true);
});

test('a price band needs three deals and gives low, middle and high', () => {
  const bands = priceBands(
    [
      { category: 'tech', priceUsdc: 100, ts: NOW - DAY },
      { category: 'tech', priceUsdc: 300, ts: NOW - 2 * DAY },
      { category: 'tech', priceUsdc: 150, ts: NOW - 3 * DAY },
      { category: 'design', priceUsdc: 50, ts: NOW - DAY },
      { category: 'design', priceUsdc: 60, ts: NOW - DAY },
      { category: 'tech', priceUsdc: 9999, ts: NOW - 40 * DAY },
    ],
    NOW,
  );
  assert.deepEqual(bands.tech, { low: 100, mid: 150, high: 300, deals: 3 });
  assert.equal(bands.design, undefined, 'two deals are not a band');
});
