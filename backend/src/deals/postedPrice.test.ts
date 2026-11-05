import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postedPriceUsdc } from './postedPrice.js';

test('a price raised by the accepted offer shows what was posted', () => {
  assert.equal(postedPriceUsdc('35', '25000000'), '25');
});

test('the same price, or no posted budget, shows nothing', () => {
  assert.equal(postedPriceUsdc('25', '25000000'), null);
  assert.equal(postedPriceUsdc('25.5', '25500000'), null);
  assert.equal(postedPriceUsdc('35', null), null);
  assert.equal(postedPriceUsdc('35', '0'), null);
  assert.equal(postedPriceUsdc('35', 'not-a-number'), null);
});

test('a fractional posted budget keeps its cents', () => {
  assert.equal(postedPriceUsdc('30', '27500000'), '27.5');
});
