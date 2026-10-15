import assert from 'node:assert/strict';
import test from 'node:test';
import { publicListing } from './publicListing.js';
import type { Listing } from '../db/listings.js';

const base: Listing = {
  id: 'lst_1', sellerUser: '0xs', sellerAgent: '0xa', title: 'Logo', description: 'd', askingPriceUsdc: 50,
  negotiationMaxDecreasePct: 10, postedAt: 1, expiresAt: 2, matchedJobId: 'job_secret',
};

test('the public view drops the floor, the matched deal and the seed key', () => {
  const view = publicListing({ ...base, seedKey: 'mk1-offer-3' }) as Record<string, unknown>;
  for (const key of ['negotiationMaxDecreasePct', 'matchedJobId', 'seedKey']) assert.equal(key in view, false, key);
});

test('seeded stock is marked as an example and real listings are not', () => {
  assert.equal(publicListing({ ...base, seedKey: 'mk1-offer-3' }).example, true);
  assert.equal(publicListing(base).example, false);
});
