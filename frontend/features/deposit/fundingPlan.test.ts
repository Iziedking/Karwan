import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { defaultFundRoute, fundingShortfall } from './fundingPlan';

/// Funding a deal asks for what the buyer's account is short, from a source
/// already chosen, so the sheet always has one obvious next step.
///
///   npx tsx --test features/deposit/fundingPlan.test.ts

test('the amount is what the deal still needs after the money already in place', () => {
  assert.equal(fundingShortfall(987.35, 68.47535), 918.88);
  assert.equal(fundingShortfall(987.35, 1000), 0);
  assert.equal(fundingShortfall(1209, 0), 1209);
});

test('an unknown balance asks for the whole amount rather than guess', () => {
  assert.equal(fundingShortfall(1209, null), 1209);
});

test('the first source that covers the amount is chosen for you', () => {
  assert.equal(defaultFundRoute(900, { wallet: 1000, otherAgent: 2000 }), 'wallet');
  assert.equal(defaultFundRoute(900, { wallet: 21.49, otherAgent: 960.74 }), 'otherAgent');
  assert.equal(defaultFundRoute(900, { wallet: 21.49, otherAgent: null }), 'chain');
  assert.equal(defaultFundRoute(900, { wallet: 21.49, otherAgent: 100 }), 'chain');
});

test('while balances are still loading, the wallet is chosen', () => {
  assert.equal(defaultFundRoute(900, { wallet: null, otherAgent: null }), 'wallet');
});

test('the sources read as one list with a choice already made, explanations in place', () => {
  const src = readFileSync('features/deposit/components/FundAgentOptions.tsx', 'utf8');
  assert.match(src, /role="radiogroup"/);
  assert.match(src, /role="radio"/);
  assert.doesNotMatch(src, /<Hint/);
  assert.doesNotMatch(src, /id: 'gateway'/, 'top up and deposit from another chain are one source');
  const rows = readFileSync('features/deals/workspace/FundingQuoteRows.tsx', 'utf8');
  assert.doesNotMatch(rows, /\bmono\b/);
});
