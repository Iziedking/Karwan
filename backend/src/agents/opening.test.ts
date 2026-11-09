import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetRange } from './budgetRange.js';
import { priceKindOf, refereeTarget, sellerOpening, type OpeningInput } from './opening.js';

/// View 73, decisions 1, 2, 3 and 5 (spec S1, S4): where a seller opens.

const base: OpeningInput = {
  kind: 'from',
  postedUsdc: 30,
  lowestUsdc: 25,
  refereeTargetUsdc: 222,
  marketUsdc: null,
  fit: 0.8,
  record: 0.5,
  heat: 0.5,
  seed: 'seller-a:7',
};

test('Fixed means the lowest equals the asking price', () => {
  assert.equal(priceKindOf({ askingPriceUsdc: 100, floorUsdc: 100 }), 'fixed');
  assert.equal(priceKindOf({ askingPriceUsdc: 100, floorUsdc: 99.99 }), 'from');
});

test('the target is the budget, clamped to the range top', () => {
  assert.equal(refereeTarget(222, budgetRange(222)), 222);
  assert.equal(refereeTarget(222, { lowUsdc: 150, highUsdc: 200 }), 200);
  assert.equal(refereeTarget(0, null), 0);
});

test('a posted price under the budget opens between it and the budget', () => {
  for (const kind of ['from', 'fixed'] as const) {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const o = sellerOpening({ ...base, kind, seed });
      assert.ok(o.priceUsdc > 30 && o.priceUsdc <= 222, `${kind} ${seed} opened at ${o.priceUsdc}`);
      assert.equal(o.outside, false);
      assert.equal(o.counterable, true);
    }
  }
  const weak = sellerOpening({ ...base, fit: 0, record: 0, heat: 0 }).priceUsdc;
  const strong = sellerOpening({ ...base, fit: 1, record: 1, heat: 1 }).priceUsdc;
  assert.ok(strong > weak, 'a stronger seller opens higher');
});

test('a posted price equal to the budget opens at it', () => {
  const o = sellerOpening({ ...base, postedUsdc: 222, lowestUsdc: 200 });
  assert.deepEqual(o, { priceUsdc: 222, outside: false, counterable: true });
});

test('a Fixed price over the budget stays put and cannot be countered', () => {
  const o = sellerOpening({ ...base, kind: 'fixed', postedUsdc: 255, lowestUsdc: 255, marketUsdc: 600 });
  assert.deepEqual(o, { priceUsdc: 255, outside: true, counterable: false });
});

test('a From price over the budget opens at its lowest, outside when over the target', () => {
  assert.deepEqual(sellerOpening({ ...base, postedUsdc: 260, lowestUsdc: 200 }), { priceUsdc: 200, outside: false, counterable: true });
  assert.deepEqual(sellerOpening({ ...base, postedUsdc: 300, lowestUsdc: 240 }), { priceUsdc: 240, outside: true, counterable: true });
});

test('no opening sits under half the market price, nor over the target for it', () => {
  const o = sellerOpening({ ...base, fit: 0, record: 0, heat: 0, marketUsdc: 400 });
  assert.equal(o.priceUsdc, 200);
  assert.equal(sellerOpening({ ...base, marketUsdc: 1000 }).priceUsdc, 222);
  assert.equal(sellerOpening({ ...base, postedUsdc: 260, lowestUsdc: 100, marketUsdc: 300 }).priceUsdc, 150);
});

test('no market price skips the half market floor', () => {
  const none = sellerOpening({ ...base, marketUsdc: null });
  const zero = sellerOpening({ ...base, marketUsdc: 0 });
  assert.ok(Number.isFinite(none.priceUsdc));
  assert.equal(none.priceUsdc, zero.priceUsdc);
  assert.ok(none.priceUsdc > 30 && none.priceUsdc < 222);
});

test('no budget opens at the posted price', () => {
  assert.deepEqual(sellerOpening({ ...base, refereeTargetUsdc: 0 }), { priceUsdc: 30, outside: false, counterable: true });
  assert.equal(sellerOpening({ ...base, refereeTargetUsdc: 0, marketUsdc: 100 }).priceUsdc, 50);
});
