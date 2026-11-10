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

test('the public view links to the photos and never carries the images', () => {
  const view = publicListing({ ...base, photos: [{ contentType: 'image/jpeg', size: 1200, at: 9 }] });
  assert.deepEqual(view.photoUrls, ['/api/listings/lst_1/photos/0?v=9']);
  assert.equal(JSON.stringify(view).includes('base64'), false);
  assert.deepEqual(publicListing(base).photoUrls, []);
});

test('an example offer names the photograph that fits it, and nothing else of its seed', () => {
  assert.equal(publicListing({ ...base, seedKey: 'mk1-a03-o-brand-design-0-1' }).examplePhoto, 'brand-design');
  assert.equal(publicListing({ ...base, seedKey: 'mk1-a11-o-phones-electronics-9-2' }).examplePhoto, 'phones-electronics');
  for (const seedKey of ['mk1-offer-3', 'mk1-a03-r-brand-design-4', 'mk1-a03-o-not-a-specialty-0-1', 'offer-lagos-design-studio', undefined]) {
    assert.equal(publicListing({ ...base, seedKey }).examplePhoto, null, String(seedKey));
  }
  assert.equal('seedKey' in (publicListing({ ...base, seedKey: 'mk1-a03-o-brand-design-0-1' }) as Record<string, unknown>), false);
});
