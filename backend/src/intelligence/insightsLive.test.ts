import assert from 'node:assert/strict';
import test from 'node:test';
import { isPriceMiss, lowestPrice } from './insightsLive.js';

/// The facts behind a person's insights (view 52, step 1).
///
///   npx tsx --test src/intelligence/insightsLive.test.ts

test('a missed request is a price question the seller said no to, or never answered', () => {
  const q = { side: 'seller' as const, kind: 'price-below-floor' as const };
  assert.equal(isPriceMiss({ ...q, state: 'expired', answer: undefined }), true);
  assert.equal(isPriceMiss({ ...q, state: 'answered', answer: { choice: 'no' } }), true);
  assert.equal(isPriceMiss({ ...q, state: 'answered', answer: { choice: 'yes' } }), false);
  assert.equal(isPriceMiss({ ...q, state: 'input-required', answer: undefined }), false);
  assert.equal(isPriceMiss({ ...q, kind: 'time', state: 'expired', answer: undefined }), false);
  assert.equal(isPriceMiss({ side: 'buyer', kind: 'price-below-floor', state: 'expired', answer: undefined }), false);
});

test('the lowest price is the lowest across the person’s priced ways, none without one', () => {
  const ways = {
    saved: true,
    sell: [
      { shape: 'one_time', priceMin: 40, priceUsual: 60, daysMin: 1, daysMax: 5 },
      { shape: 'goods', what: 'Rice', priceMin: 25, priceUsual: 30, shipsTo: 'Abuja', arriveDaysMin: 1, arriveDaysMax: 3 },
      { shape: 'hourly', rateMin: 5, rateUsual: 8, hoursMax: 10 },
    ],
    buy: [],
  } as never;
  assert.equal(lowestPrice(ways), 25);
  assert.equal(lowestPrice({ saved: true, sell: [], buy: [] } as never), null);
});
