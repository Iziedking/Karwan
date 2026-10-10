import assert from 'node:assert/strict';
import test from 'node:test';
import { answerFromListing } from './sellerRules.js';

const listing = { askingPriceUsdc: 200, negotiationMaxDecreasePct: 10, readyInDays: 5, terms: 'Two rounds of edits.' };

test('price: the asking price and the lowest the seller set, never lower', () => {
  const a = answerFromListing(listing, { topic: 'price' });
  assert.deepEqual(a, { answered: true, topic: 'price', askingUsdc: 200, lowestUsdc: 180 });
});

test('a budget below the floor is answered as out of reach, not negotiated by the model', () => {
  assert.deepEqual(answerFromListing(listing, { topic: 'price', budgetUsdc: 150 }), {
    answered: true,
    topic: 'price',
    askingUsdc: 200,
    lowestUsdc: 180,
    fitsBudget: false,
  });
  assert.equal((answerFromListing(listing, { topic: 'price', budgetUsdc: 190 }) as { fitsBudget?: boolean }).fitsBudget, true);
});

test('timeline comes from ready-in days', () => {
  assert.deepEqual(answerFromListing(listing, { topic: 'timeline' }), { answered: true, topic: 'timeline', readyInDays: 5 });
});

test('terms are the seller’s own words', () => {
  assert.deepEqual(answerFromListing(listing, { topic: 'terms' }), { answered: true, topic: 'terms', terms: 'Two rounds of edits.' });
});

test('anything the seller has not set is unknown, never invented', () => {
  assert.deepEqual(answerFromListing({ askingPriceUsdc: 50 }, { topic: 'timeline' }), { answered: false, topic: 'timeline' });
  assert.deepEqual(answerFromListing({ askingPriceUsdc: 50 }, { topic: 'terms' }), { answered: false, topic: 'terms' });
  assert.deepEqual(answerFromListing({ askingPriceUsdc: 50 }, { topic: 'price' }), {
    answered: true,
    topic: 'price',
    askingUsdc: 50,
    lowestUsdc: 50,
  });
});
