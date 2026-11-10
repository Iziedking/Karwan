import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/// The review of an order quotes the listing with the fee the payment uses (D12).
///
///   node ../scripts/run-tests.mjs src/routes/listingsQuote.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-quote-')));
delete process.env.DATABASE_URL;

const { createListing, cancelListing, setListingOrder } = await import('../db/listings.js');
const { newDealFeeDeps } = await import('../deals/newDealFee.js');
const { listingsRoutes } = await import('./listings.js');

newDealFeeDeps.feeBps = async () => 100;
const seller = { sellerUser: '0x00000000000000000000000000000000000000aa', sellerAgent: '0x00000000000000000000000000000000000000ab' };

test('a listing is quoted as Price, Karwan fee and You pay', async () => {
  const l = createListing({ ...seller, title: 'Logo design', description: 'Three concepts.', askingPriceUsdc: 120, readyInDays: 3 });
  const before = Math.floor(Date.now() / 1000);
  const res = await listingsRoutes.request(`/${l.id}/quote`);
  assert.equal(res.status, 200);
  const q = (await res.json()) as { priceUsdc: string; feeUsdc: string; youPayUsdc: string; feeBps: number; deliverByUnix: number | null; parts: number };
  assert.equal(q.priceUsdc, '120');
  assert.equal(q.feeUsdc, '0.6');
  assert.equal(q.youPayUsdc, '120.6');
  assert.equal(q.feeBps, 100);
  assert.equal(q.parts, 1);
  assert.ok(q.deliverByUnix && Math.abs(q.deliverByUnix - (before + 3 * 86400)) < 60);
});

test('a closed listing is not quoted, and a missing one is not found', async () => {
  const l = createListing({ ...seller, title: 'Old offer', description: 'Gone.', askingPriceUsdc: 50 });
  cancelListing(l.id);
  const closed = await listingsRoutes.request(`/${l.id}/quote`);
  assert.equal(closed.status, 409);
  assert.equal(((await closed.json()) as { code: string }).code, 'CLOSED');
  assert.equal((await listingsRoutes.request('/lst_ffffffffffffffff/quote')).status, 404);
});

test('the quote says when an order would wait for the seller, and never shows the order it waits on', async () => {
  const l = createListing({ ...seller, title: 'Used phone', description: 'One phone.', askingPriceUsdc: 150, deliveryKind: 'goods' });
  const q = (await (await listingsRoutes.request(`/${l.id}/quote`)).json()) as { waitsForSeller: boolean };
  assert.equal(q.waitsForSeller, false);
  setListingOrder(l.id, `0x${'ab'.repeat(32)}`);
  const one = (await (await listingsRoutes.request(`/${l.id}`)).json()) as { listing: Record<string, unknown> };
  assert.equal('orderJobId' in one.listing, false);
  const list = (await (await listingsRoutes.request('/')).json()) as { listings: Array<Record<string, unknown>> };
  assert.equal(list.listings.some((row) => 'orderJobId' in row), false);
});

test('the quote says a seller on Ask me first, or with the agent off, decides first', async () => {
  const { config } = await import('../config.js');
  const { upsertProfile } = await import('../db/profiles.js');
  const asks = '0x00000000000000000000000000000000000000c1';
  const off = '0x00000000000000000000000000000000000000d1';
  await upsertProfile({ address: asks, role: 'seller', displayName: 'Cara', agentPrefs: { agentMode: 'ask' } } as never);
  await upsertProfile({ address: off, role: 'seller', displayName: 'Dele', agentPrefs: { agentMode: 'agree', agentOn: false } } as never);
  const a = createListing({ sellerUser: asks, sellerAgent: '0x00000000000000000000000000000000000000c2', title: 'Copy', description: 'Five pages.', askingPriceUsdc: 80 });
  const b = createListing({ sellerUser: off, sellerAgent: '0x00000000000000000000000000000000000000d2', title: 'Edit', description: 'One video.', askingPriceUsdc: 60 });
  const c = createListing({ ...seller, title: 'Logo', description: 'One logo.', askingPriceUsdc: 40 });
  const read = async (id: string) => (await (await listingsRoutes.request(`/${id}/quote`)).json()) as { waitsForSeller: boolean; waitReason?: string };
  const before = config.SELLER_ASKED;
  try {
    config.SELLER_ASKED = false;
    assert.equal((await read(a.id)).waitsForSeller, false);
    config.SELLER_ASKED = true;
    assert.deepEqual([(await read(a.id)).waitsForSeller, (await read(a.id)).waitReason], [true, 'asks']);
    assert.deepEqual([(await read(b.id)).waitsForSeller, (await read(b.id)).waitReason], [true, 'asks']);
    const plain = await read(c.id);
    assert.equal(plain.waitsForSeller, false);
    assert.equal('waitReason' in plain, false);
  } finally {
    config.SELLER_ASKED = before;
  }
});
