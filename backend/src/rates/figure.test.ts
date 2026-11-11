import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UsdcRates } from './usdcRates.js';
import { figureFor, type KeptFigure } from './figure.js';
import { localiseUsdcText } from './localAmounts.js';
import { keptFiguresOf } from './keptFigures.js';

const RATES: UsdcRates = { rates: { NGN: 1346.11, EUR: 0.889118, KES: 129.91 }, updatedAt: 1_793_865_348_000, source: 'coingecko' };
const NONE: UsdcRates = { rates: {}, updatedAt: null, source: null };
// ₦300,000 said when 1 USDC was ₦1,346.13: a budget of 222.86 USDC.
const BUDGET: KeptFigure = { usdc: 222.86, local: { currency: 'NGN', amount: '300000' } };

test('typed stays typed: the figure a person said reads exactly, whatever the rate is now', () => {
  assert.equal(figureFor(222.86, 'NGN', RATES, 'en', [BUDGET]), '₦300,000');
  assert.equal(figureFor(222.86, 'NGN', RATES, 'en'), '₦299,994', 'without the kept figure it would drift');
});

test('a reader in another currency reads the shared rate', () => {
  assert.match(figureFor(222.86, 'KES', RATES, 'en', [BUDGET]) ?? '', /28,952/);
  assert.equal(figureFor(222.86, 'EUR', RATES, 'en', [BUDGET]), '€198.15');
});

test('only the amount that was said is kept; other amounts read at the shared rate', () => {
  assert.equal(figureFor(200, 'NGN', RATES, 'en', [BUDGET]), '₦269,222');
  assert.equal(figureFor(222.87, 'NGN', RATES, 'en', [BUDGET]), '₦300,008');
});

test('a kept figure still reads with no rate; anything else has no local figure', () => {
  assert.equal(figureFor(222.86, 'NGN', NONE, 'en', [BUDGET]), '₦300,000');
  assert.equal(figureFor(200, 'NGN', NONE, 'en', [BUDGET]), null);
  assert.equal(figureFor(222.86, 'USDC', RATES, 'en', [BUDGET]), null);
  assert.equal(figureFor(222.86, undefined, RATES, 'en', [BUDGET]), null);
});

test('a kept figure with cents reads with its cents', () => {
  const kept: KeptFigure = { usdc: 55.6, local: { currency: 'EUR', amount: '49.5' } };
  assert.equal(figureFor(55.6, 'EUR', RATES, 'en', [kept]), '€49.50');
});

test('a message about a request says the budget as it was said', () => {
  const text = '*Your shortlist is ready.* Budget 222.86 USDC. Best offer 200 USDC.';
  assert.equal(localiseUsdcText(text, 'NGN', RATES, 'en', [BUDGET]), '*Your shortlist is ready.* Budget ₦300,000. Best offer ₦269,222.');
});

test('an agent price at exactly the budget reads the budget figure', () => {
  assert.equal(localiseUsdcText('Your agent agreed 222.86 USDC with @ada.', 'NGN', RATES, 'en', [BUDGET]), 'Your agent agreed ₦300,000 with @ada.');
});

test('the kept figures of a request, a deal and an offer for sale', () => {
  const kept = keptFiguresOf({
    brief: { budgetLocal: { currency: 'NGN', amount: '300000', rate: 1346.13, at: 1 } },
    deal: { dealAmountUsdc: '74.28', agreedLocal: { currency: 'NGN', amount: '100000', rate: 1346.2, at: 1 } },
    listing: { askingPriceUsdc: 37.144, askingLocal: { currency: 'NGN', amount: '50000', rate: 1346.11, at: 1 } },
  });
  assert.deepEqual(kept.map((k) => [k.usdc, k.local.amount]), [[222.86, '300000'], [74.28, '100000'], [37.144, '50000']]);
  assert.deepEqual(keptFiguresOf({ brief: {}, deal: { dealAmountUsdc: '10' }, listing: null }), []);
});

test('a message about a past payment reads what it was worth to this reader then (view 77)', () => {
  const ADA = '0x2222222222222222222222222222222222222222';
  const kept = keptFiguresOf({
    viewer: ADA,
    deal: { dealAmountUsdc: '74.28', settledWorth: { [ADA]: { currency: 'NGN', amount: '100000', rate: 1346.2, at: 1 } } },
    movements: [
      { state: 'completed', amountMicros: '37140000', initiatedBy: '0x1111111111111111111111111111111111111111', participants: [], worth: { [ADA]: { currency: 'NGN', amount: '50000', rate: 1346.3, at: 1 } } },
      { state: 'verifying', amountMicros: '10000000', initiatedBy: ADA, participants: [], worth: { [ADA]: { currency: 'NGN', amount: '13460', rate: 1346, at: 1 } } },
    ] as never,
  });
  assert.deepEqual(kept.map((k) => [k.usdc, k.local.amount]), [[74.28, '100000'], [37.14, '50000']], 'a payment still in flight keeps nothing');
  // The rate has moved since: today 37.14 USDC would read 49,994.
  assert.equal(localiseUsdcText('Milestone 1 paid: 37.14 USDC of 74.28 USDC.', 'NGN', RATES, 'en', kept), 'Milestone 1 paid: ₦50,000 of ₦100,000.');
  assert.deepEqual(keptFiguresOf({ deal: { dealAmountUsdc: '74.28', settledWorth: { [ADA]: { currency: 'NGN', amount: '100000', rate: 1, at: 1 } } } }), [], 'no reader, no worth');
});
