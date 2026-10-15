import assert from 'node:assert/strict';
import test from 'node:test';
import { walletAmount } from './walletFormat';

test('a wallet balance always reads to the cent', () => {
  assert.equal(walletAmount('459.1'), '459.10');
  assert.equal(walletAmount('13.888'), '13.89');
  assert.equal(walletAmount('1200'), '1,200.00');
  assert.equal(walletAmount('0'), '0.00');
});

test('a balance that could not load is null, so the page says so in the reader’s language', () => {
  assert.equal(walletAmount(null), null);
  assert.equal(walletAmount(undefined), null);
  assert.equal(walletAmount('abc'), null);
});
