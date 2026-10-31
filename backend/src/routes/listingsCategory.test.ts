import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-category-')));
delete process.env.DATABASE_URL;

const { createListing } = await import('../db/listings.js');
const { listingsRoutes } = await import('./listings.js');

const seller = { sellerUser: '0x00000000000000000000000000000000000000aa', sellerAgent: '0x00000000000000000000000000000000000000ab' };

test('the market and the offer page say which category an offer is in', async () => {
  const picked = createListing({ ...seller, title: 'Jollof rice trays', description: 'For parties of 50, Lagos only.', askingPriceUsdc: 60, category: 'food' });
  const read = createListing({ ...seller, title: 'Samsung Galaxy A54', description: 'Used, clean, with box.', askingPriceUsdc: 150 });
  const list = (await (await listingsRoutes.request('/')).json()) as { listings: Array<{ id: string; category: string | null }> };
  assert.equal(list.listings.find((l) => l.id === picked.id)?.category, 'food');
  assert.equal(list.listings.find((l) => l.id === read.id)?.category, 'phones');
  // Every row says who sells it; a seller with no record here reads as null, never an address.
  assert.ok(list.listings.every((l) => 'seller' in l));
  const one = (await (await listingsRoutes.request(`/${read.id}`)).json()) as { listing: { category: string | null } };
  assert.equal(one.listing.category, 'phones');
});

test('a category outside the list is refused before anything else is checked', async () => {
  const res = await listingsRoutes.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...seller, title: 'A car', description: 'Toyota Corolla 2012', askingPriceUsdc: 3000, category: 'cars' }),
  });
  assert.equal(res.status, 400);
});
