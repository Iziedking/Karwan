import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-edit-')));
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET ??= 'listing-edit-test-secret-at-least-32-characters';

const { signSession } = await import('../auth/session.js');
const { createListing, getListing } = await import('../db/listings.js');
const { listingsRoutes } = await import('./listings.js');

const ADA = '0x00000000000000000000000000000000000000aa';
const cookie = `karwan_session=${signSession({ address: ADA, method: 'circle', email: 'a@example.com' })}`;

test('a seller who changes the floor and the window has both saved, not just the words', async () => {
  const listing = createListing({ sellerUser: ADA, sellerAgent: '0x00000000000000000000000000000000000000ab', title: 'Logo kit', description: 'Three versions and a guide.', askingPriceUsdc: 100, negotiationMaxDecreasePct: 5, ttlDays: 30 });
  const before = Date.now();
  const res = await listingsRoutes.request(`/${listing.id}/edit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ caller: ADA, negotiationMaxDecreasePct: 20, ttlDays: 10, category: 'design' }),
  });
  assert.equal(res.status, 200);
  const saved = getListing(listing.id)!;
  assert.equal(saved.negotiationMaxDecreasePct, 20);
  assert.ok(Math.abs(saved.expiresAt - (before + 10 * 86_400_000)) < 60_000, 'the window runs ten days from the edit');
  assert.equal(saved.category, 'design');
  const owner = (await (await listingsRoutes.request(`/${listing.id}`, { headers: { cookie } })).json()) as { floor: number };
  assert.equal(owner.floor, 80);
});

test('only the seller can change the floor or the window', async () => {
  const listing = createListing({ sellerUser: ADA, sellerAgent: '0x00000000000000000000000000000000000000ab', title: 'Flyer', description: 'One page, two rounds.', askingPriceUsdc: 20 });
  const other = `karwan_session=${signSession({ address: '0x00000000000000000000000000000000000000cc', method: 'circle', email: 'c@example.com' })}`;
  const refused = await listingsRoutes.request(`/${listing.id}/edit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: other },
    body: JSON.stringify({ caller: ADA, ttlDays: 1 }),
  });
  assert.equal(refused.status, 403);
  assert.notEqual(getListing(listing.id)!.expiresAt, undefined);
});
