import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_QUANTITY, perItemUsdc, quantityWords, readQuantity } from './quantity.js';

/// A request is read for a count and what is counted (view 41). Unreadable
/// means null, and the whole amount is compared as before.
///
///   npx tsx --test src/llm/quantity.test.ts

test('a count followed by what is counted is read, in words or digits', () => {
  assert.deepEqual(readQuantity('3 pairs of Clark shoes, size 42, black'), { count: 3, unit: 'pairs' });
  assert.deepEqual(readQuantity('200 T-shirts with our logo, cotton'), { count: 200, unit: 't-shirts' });
  assert.deepEqual(readQuantity('Two owambe outfits for a wedding in Lagos'), { count: 2, unit: 'outfits' });
  assert.deepEqual(readQuantity('1,000 flyers, A5, full colour'), { count: 1000, unit: 'flyers' });
  assert.deepEqual(readQuantity('٣ pairs of sandals'), { count: 3, unit: 'pairs' });
});

test('a dozen and a multiplier are read too', () => {
  assert.deepEqual(readQuantity('a dozen eggs, delivered on Friday'), { count: 12, unit: 'eggs' });
  assert.deepEqual(readQuantity('half a dozen cupcakes'), { count: 6, unit: 'cupcakes' });
  assert.deepEqual(readQuantity('two dozen roses'), { count: 24, unit: 'roses' });
  assert.deepEqual(readQuantity('2x phone cases, clear'), { count: 2, unit: 'phone cases' });
  assert.deepEqual(readQuantity('Need these x3'), { count: 3, unit: null });
});

test('money, time, scope and model numbers are not a quantity', () => {
  assert.equal(readQuantity('Logo and brand design'), null);
  assert.equal(readQuantity('A website for 100 USDC in 3 to 5 days'), null);
  assert.equal(readQuantity('Repair an iPhone 13 pro max'), null);
  assert.equal(readQuantity('Edit a 10 pages brochure in 2 weeks'), null);
  assert.equal(readQuantity('Cater for 40 guests'), null);
  assert.equal(readQuantity('5 kg of rice'), null, 'no plural item word, the whole amount is compared');
});

test('the count is bounded and never zero', () => {
  assert.equal(readQuantity('0 pairs of shoes'), null);
  assert.equal(readQuantity(`${MAX_QUANTITY + 1} bottles of water`), null);
  assert.deepEqual(readQuantity(`${MAX_QUANTITY} bottles of water`), { count: MAX_QUANTITY, unit: 'bottles' });
});

test('the words and the per-item amount read the way a person says them', () => {
  assert.equal(quantityWords({ count: 3, unit: 'pairs' }), '3 pairs');
  assert.equal(quantityWords({ count: 2, unit: null }), '2 items');
  assert.equal(perItemUsdc(100, 3), 33);
  assert.equal(perItemUsdc(10, 4), 2.5);
  assert.equal(perItemUsdc(96, 3), 32);
});
