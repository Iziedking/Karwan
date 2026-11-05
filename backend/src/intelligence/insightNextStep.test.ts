import assert from 'node:assert/strict';
import test from 'node:test';
import { insightNextStep } from './insightNextStep.js';

///   npx tsx --test src/intelligence/insightNextStep.test.ts

test('each action names a tool that asks the person to confirm', () => {
  assert.equal(insightNextStep({ action: { kind: 'set-lowest-price', priceUsdc: 25 } }).tool, 'set_way_i_deal');
  assert.equal(insightNextStep({ action: { kind: 'show-offers', jobId: '0xr' } }).tool, 'list_offers_on_request');
});

test('a request budget or due date is changed by taking it down and posting it again, never edited in place', () => {
  const budget = insightNextStep({ action: { kind: 'set-request-budget', jobId: '0xr', budgetUsdc: 50 } });
  assert.equal(budget.tool, 'propose_take_down');
  assert.match(budget.then!, /propose_post_request with a budget of 50 USDC/);
  assert.equal(insightNextStep({ action: { kind: 'set-request-days', jobId: '0xr', days: 7 } }).label, 'Post it again with 7 days');
});
