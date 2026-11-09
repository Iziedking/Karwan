import assert from 'node:assert/strict';
import test from 'node:test';
import { listingBidTerms, profileOpening, type OpeningSignals } from './bargainOpening.js';

/// View 73, decisions 1, 2, 3 and 5 (plan task 5): the terms a seller's agent
/// bids with, with bargaining on and off.

const signals: OpeningSignals = { marketUsdc: null, fit: 0.8, record: 0.5, heat: 0.5, seed: 'seller-a:7' };
const on = { budgetUsdc: 222, leewayPct: 0, bargain: true };
const off = { ...on, bargain: false };

test('with bargain on, a posted offer under the budget bids its opening, not its posted price', () => {
  const t = listingBidTerms({ askingPriceUsdc: 30, floorUsdc: 25 }, on, signals);
  assert.ok(t.askingPriceUsdc > 30 && t.askingPriceUsdc <= 222);
  assert.equal(t.openedUsdc, t.askingPriceUsdc);
  assert.equal(t.floorUsdc, 30, 'the posted price is the lowest the agent goes');
  assert.equal(t.outsideRequest, false);
  assert.equal(t.counterable, true);
});

test('with bargain on, a Fixed offer under the budget bargains up from its price', () => {
  const t = listingBidTerms({ askingPriceUsdc: 100, floorUsdc: 100 }, on, signals);
  assert.ok(t.askingPriceUsdc > 100 && t.askingPriceUsdc <= 222);
  assert.equal(t.floorUsdc, 100);
});

test('with bargain on, a Fixed offer over the budget bids its price, outside, not counterable', () => {
  const t = listingBidTerms({ askingPriceUsdc: 255, floorUsdc: 255 }, on, signals);
  assert.deepEqual(t, { askingPriceUsdc: 255, floorUsdc: 255, outsideRequest: true, counterable: false, openedUsdc: 255 });
});

test('with bargain on, a From offer over the budget opens at its lowest', () => {
  const inside = listingBidTerms({ askingPriceUsdc: 260, floorUsdc: 200 }, on, signals);
  assert.equal(inside.askingPriceUsdc, 200);
  assert.equal(inside.outsideRequest, false);
  const leeway = listingBidTerms({ askingPriceUsdc: 300, floorUsdc: 230 }, { ...on, leewayPct: 10 }, signals);
  assert.equal(leeway.askingPriceUsdc, 230);
  assert.equal(leeway.outsideRequest, false, 'inside the leeway is not outside the request');
  assert.equal(leeway.counterable, true);
  assert.equal(listingBidTerms({ askingPriceUsdc: 300, floorUsdc: 250 }, on, signals).outsideRequest, true);
});

test('with bargain off, a posted offer bids its own price', () => {
  assert.deepEqual(listingBidTerms({ askingPriceUsdc: 30, floorUsdc: 25 }, off, signals), {
    askingPriceUsdc: 30, floorUsdc: 25, outsideRequest: false, counterable: true, openedUsdc: 30,
  });
  assert.deepEqual(listingBidTerms({ askingPriceUsdc: 300, floorUsdc: 250 }, off, signals), {
    askingPriceUsdc: 250, floorUsdc: 250, outsideRequest: true, counterable: true, openedUsdc: 250,
  });
});

test('a request with no budget opens at the posted price', () => {
  const t = listingBidTerms({ askingPriceUsdc: 30, floorUsdc: 25 }, { ...on, budgetUsdc: 0 }, signals);
  assert.equal(t.askingPriceUsdc, 30);
  assert.equal(t.outsideRequest, false);
});

test('a profile bid opens from the usual price toward the budget', () => {
  const o = profileOpening({ usualUsdc: 50, lowestUsdc: 40 }, 222, signals)!;
  assert.ok(o > 50 && o <= 222);
  assert.equal(profileOpening({ usualUsdc: null, lowestUsdc: 40 }, 222, signals), null);
  assert.equal(profileOpening({ usualUsdc: 50, lowestUsdc: 40 }, 0, signals), null);
});
