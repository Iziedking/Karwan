import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetInCents } from './budgetCents.js';

test('a budget finer than a cent is rounded down to the cent', () => {
  assert.equal(budgetInCents(222.877647), 222.87);
  assert.equal(budgetInCents(0.019999), 0.01);
});

test('a budget already in cents is unchanged', () => {
  for (const b of [222.88, 50, 0.01, 1234.56, 19.99, 5_000_000]) assert.equal(budgetInCents(b), b);
});

test('no price in cents at or under the said budget passes the stored one', () => {
  const said = 222.877647;
  const stored = budgetInCents(said);
  assert.ok(stored <= said);
  // The seller's agent rounds its price to cents; at the budget it lands on it.
  assert.equal(Number(Math.min(said, stored).toFixed(2)), stored);
  assert.ok(Number(said.toFixed(2)) > said, 'the old rounding went over');
});

test('under a cent leaves nothing', () => {
  assert.equal(budgetInCents(0.004), 0);
});
