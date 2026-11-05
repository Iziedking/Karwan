import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicCounterDecision } from './strategy.js';

/// A counter is answered by the code rule when no model answers, so a
/// negotiation never waits on a provider (view 52, rule 8).
///
///   npx tsx --test src/agents/strategy.test.ts

test('the buyer accepts a counter within their cap and declines one above it', () => {
  assert.equal(heuristicCounterDecision({ role: 'buyer', theirOffer: 80, floor: 0, ceiling: 80 }).decision, 'accept');
  assert.equal(heuristicCounterDecision({ role: 'buyer', theirOffer: 80.01, floor: 0, ceiling: 80 }).decision, 'decline');
});

test('the seller accepts a counter at or above their floor and declines one below it', () => {
  assert.equal(heuristicCounterDecision({ role: 'seller', theirOffer: 25, floor: 25, ceiling: 0 }).decision, 'accept');
  assert.equal(heuristicCounterDecision({ role: 'seller', theirOffer: 24.99, floor: 25, ceiling: 0 }).decision, 'decline');
});
