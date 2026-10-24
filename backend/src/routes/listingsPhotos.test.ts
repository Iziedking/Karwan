import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-photos-')));
delete process.env.DATABASE_URL;

const { createListing, setListingPhotos } = await import('../db/listings.js');
const { offerPhotos } = await import('../listings/photos.js');
const { listingsRoutes } = await import('./listings.js');

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7]);

function postedWithPhoto() {
  const listing = createListing({
    sellerUser: '0x00000000000000000000000000000000000000aa',
    sellerAgent: '0x00000000000000000000000000000000000000ab',
    title: 'Human hair wig, 18 inch',
    description: 'Brazilian straight, worn once, ships from Lagos.',
    askingPriceUsdc: 120,
    deliveryKind: 'goods',
  });
  setListingPhotos(listing.id, offerPhotos.save(listing.id, [{ bytes: JPEG, contentType: 'image/jpeg' }], 42));
  return listing;
}

test('an offer photo is served from its link with a long cache and its real type', async () => {
  const listing = postedWithPhoto();
  const res = await listingsRoutes.request(`/${listing.id}/photos/0?v=42`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.match(res.headers.get('cache-control') ?? '', /immutable/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [...JPEG]);
  assert.equal((await listingsRoutes.request(`/${listing.id}/photos/1`)).status, 404);
  assert.equal((await listingsRoutes.request('/lst_missing/photos/0')).status, 404);
});

test('the market list and the offer page carry photo links, not images', async () => {
  const listing = postedWithPhoto();
  const list = (await (await listingsRoutes.request('/')).json()) as { listings: Array<{ id: string; photoUrls: string[] }> };
  const row = list.listings.find((l) => l.id === listing.id)!;
  assert.deepEqual(row.photoUrls, [`/api/listings/${listing.id}/photos/0?v=42`]);
  const one = (await (await listingsRoutes.request(`/${listing.id}`)).json()) as { listing: { photoUrls: string[] } };
  assert.equal(one.listing.photoUrls.length, 1);
  assert.equal(JSON.stringify(list).includes('base64'), false);
});

test('a new offer keeps the kind of delivery it was posted with', () => {
  assert.equal(postedWithPhoto().deliveryKind, 'goods');
});

test('reporting an offer needs a signed-in person, and only the team clears photos', async () => {
  const listing = postedWithPhoto();
  const report = await listingsRoutes.request(`/${listing.id}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'photo' }),
  });
  assert.equal(report.status, 401);
  const clear = await listingsRoutes.request(`/${listing.id}/photos/clear`, { method: 'POST' });
  // Refused without the operator token (503 when none is configured).
  assert.notEqual(clear.status, 200);
  assert.ok(offerPhotos.read(listing.id, 0));
});
