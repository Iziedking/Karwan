import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-market-page-')));
delete process.env.DATABASE_URL;

const { createListing } = await import('../db/listings.js');
const { listingsRoutes } = await import('./listings.js');

const seller = { sellerUser: '0x00000000000000000000000000000000000000aa', sellerAgent: '0x00000000000000000000000000000000000000ab' };
type Page = { listings: Array<{ id: string; seller: unknown; negotiationMaxDecreasePct?: number }>; total?: number };

test('the market asks for one page and learns how many matched', async () => {
  const phones = ['Tecno Spark 20', 'Samsung Galaxy A54', 'iPhone 13 used'].map((title) =>
    createListing({ ...seller, title, description: 'Clean, with box.', askingPriceUsdc: 150, category: 'phones', negotiationMaxDecreasePct: 10 }));
  createListing({ ...seller, title: 'Jollof rice trays', description: 'For parties of 50.', askingPriceUsdc: 60, category: 'food' });

  const page = (await (await listingsRoutes.request('/?category=phones&limit=2')).json()) as Page;
  assert.equal(page.total, 3);
  assert.equal(page.listings.length, 2);
  assert.ok(page.listings.every((l) => phones.some((p) => p.id === l.id) && 'seller' in l && !('negotiationMaxDecreasePct' in l)));

  const searched = (await (await listingsRoutes.request('/?q=JOLLOF&limit=6')).json()) as Page;
  assert.equal(searched.total, 1);

  // Without a limit the list is whole and unchanged, for every other reader.
  const whole = (await (await listingsRoutes.request('/')).json()) as Page;
  assert.equal(whole.listings.length, 4);
  assert.equal('total' in whole, false);
});

test('a page request the market never sends is refused', async () => {
  assert.equal((await listingsRoutes.request('/?category=cars&limit=6')).status, 400);
  assert.equal((await listingsRoutes.request('/?limit=0')).status, 400);
});
