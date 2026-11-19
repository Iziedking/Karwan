import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSellLine } from './sellLine.js';

/// The one line a seller types at setup (view 39, 19 Nov) is split into what
/// they sell and their price, which the agent then reads as it always has.

test('what comes first, then the price and how fast', () => {
  assert.deepEqual(splitSellLine('Logo and brand design, ₦30,000 to ₦60,000, 3 days'), { what: 'Logo and brand design', price: '₦30,000 to ₦60,000, 3 days' });
  assert.deepEqual(splitSellLine('Phone repairs, about ₦15,000, same day'), { what: 'Phone repairs', price: 'about ₦15,000, same day' });
});

test('a price written first', () => {
  assert.deepEqual(splitSellLine('20 to 40 USDC logo design'), { what: 'logo design', price: '20 to 40 USDC' });
});

test('a price inside the line without commas', () => {
  assert.deepEqual(splitSellLine('Website building 150k naira in a week'), { what: 'Website building', price: '150k naira in a week' });
});

test('numbers that are not money stay with what is sold', () => {
  assert.deepEqual(splitSellLine('Ankara fabric, 6 yards a piece, ₦25,000'), { what: 'Ankara fabric, 6 yards a piece', price: '₦25,000' });
});

test('no price at all', () => {
  assert.deepEqual(splitSellLine('Ankara fabric'), { what: 'Ankara fabric', price: null });
  assert.deepEqual(splitSellLine('  Shoes, 6 sizes  '), { what: 'Shoes, 6 sizes', price: null });
});
