import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankListingCandidates, realListings } from './matchCandidates.js';

/// Seeded example stock is shown on the market with its label, but it is never
/// a seller (view 41, decision 7): it is not matched to a request and never bids.
///
///   npx tsx --test src/marketplace/examplesExcluded.test.ts

const listings = [
  { id: 'real', title: 'Logo design', description: 'Logos and brand marks', seedKey: undefined },
  { id: 'seed', title: 'Logo design', description: 'Example logo offer', seedKey: 'offer-lagos-logo' },
];

test('example listings are left out before matching', () => {
  assert.deepEqual(realListings(listings).map((l) => l.id), ['real']);
  const ranked = rankListingCandidates({ keywords: ['logo'] }, realListings(listings));
  assert.deepEqual(ranked.map((l) => l.id), ['real']);
});
