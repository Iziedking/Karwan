import assert from 'node:assert/strict';
import test from 'node:test';
import { insightLine, plain } from './insightText.js';

///   npx tsx --test src/intelligence/insightText.test.ts

test('every insight reads as a full sentence with its numbers, in every language, with no em dash or empty slot', () => {
  const cases = [
    { kind: 'testnet-budget', title: 'Logo', numbers: { budgetUsdc: 100, lowUsdc: 40, highUsdc: 65, suggestedUsdc: 50 } },
    { kind: 'missed-by-price', numbers: { count: 13, buyersMedianUsdc: 25, lowestPriceUsdc: 40 } },
    { kind: 'budget-below-band', title: 'Logo', numbers: { budgetUsdc: 25, lowUsdc: 40, highUsdc: 65, deals: 4 } },
    { kind: 'cheaper-better-sellers', title: 'Logo', numbers: { count: 2, lowestUsdc: 65, bestRating: 3, priceUsdc: 80 } },
    { kind: 'slow-request', title: 'Logo', numbers: { days: 3, usualDays: 7 } },
  ];
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    for (const c of cases) {
      const line = insightLine(c, locale);
      assert.ok(line, `${c.kind} ${locale}`);
      assert.doesNotMatch(line!, /\{\w+\}|—|undefined|NaN/, `${c.kind} ${locale}: ${line}`);
    }
  }
  assert.equal(
    plain(insightLine(cases[1]!, 'en')!),
    'You missed 13 requests this week because your lowest price, 40 USDC, was above what buyers offered. They offered around 25 USDC.',
  );
  assert.equal(insightLine({ kind: 'unknown', numbers: {} }), null);
});
