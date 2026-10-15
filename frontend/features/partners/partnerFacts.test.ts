import assert from 'node:assert/strict';
import test from 'node:test';
import { listedAmount } from './partnerFacts';

test('a bare number a business typed is regrouped, never given a unit it did not state', () => {
  assert.equal(listedAmount('5,0000'), '50,000');
  assert.equal(listedAmount('10000'), '10,000');
  assert.equal(listedAmount(' 10,000 '), '10,000');
  assert.equal(listedAmount('2500.5'), '2,500.5');
});

test('anything with words stays exactly as the business wrote it', () => {
  assert.equal(listedAmount('500 units'), '500 units');
  assert.equal(listedAmount('5,000 USD'), '5,000 USD');
  assert.equal(listedAmount(''), null);
  assert.equal(listedAmount(null), null);
});
