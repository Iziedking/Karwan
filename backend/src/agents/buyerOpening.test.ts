import assert from 'node:assert/strict';
import test from 'node:test';
import { buyerOpeningCounter, type BuyerOpeningInput } from './buyerOpening.js';

/// View 73 (spec S5): the buyer agent's first counter.

const base: BuyerOpeningInput = {
  sellerOpeningUsdc: 120,
  postedUsdc: 30,
  marketUsdc: null,
  range: { lowUsdc: 150, highUsdc: 230 },
  budgetUsdc: 222,
  overBudget: false,
};

test("the buyer's first counter is the posted price", () => {
  assert.equal(buyerOpeningCounter(base), 30);
});

test("the buyer's first counter over budget is 85 percent of it", () => {
  const over = { ...base, sellerOpeningUsdc: 260, postedUsdc: 260, overBudget: true };
  assert.equal(buyerOpeningCounter(over), 188.7);
  assert.equal(buyerOpeningCounter({ ...over, marketUsdc: 500 }), 222, 'half the market lifts it, the budget caps it');
});

test("the buyer's first counter is never above the seller's opening", () => {
  assert.equal(buyerOpeningCounter({ ...base, postedUsdc: null, sellerOpeningUsdc: 100 }), 100);
  assert.equal(buyerOpeningCounter({ ...base, postedUsdc: 300, sellerOpeningUsdc: 250 }), 222);
});

test("the buyer's first counter without a market price", () => {
  const profile = { ...base, postedUsdc: null, sellerOpeningUsdc: 200 };
  assert.equal(buyerOpeningCounter(profile), 160);
  assert.equal(buyerOpeningCounter({ ...profile, marketUsdc: 400 }), 200);
  assert.equal(buyerOpeningCounter({ ...profile, range: null, budgetUsdc: 0 }), 160);
});
