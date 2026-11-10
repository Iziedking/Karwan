import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_BACKEND = process.cwd();
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-remove-')));
delete process.env.DATABASE_URL;

const { createListing, getListing, listOpenListings, removeListingByTeam } = await import('../db/listings.js');
const { publicListing } = await import('../marketplace/publicListing.js');
const { listingsRoutes } = await import('./listings.js');
const { routeRule } = await import('../ops/adminPages.js');

///   npx tsx --test src/routes/listingsRemove.test.ts

function posted(title = 'Accounts for sale') {
  return createListing({
    sellerUser: '0x00000000000000000000000000000000000000aa',
    sellerAgent: '0x00000000000000000000000000000000000000ab',
    title,
    description: 'Something the market should not carry.',
    askingPriceUsdc: 45,
  });
}

test('the team takes one offer off the market, and nothing else of the seller', () => {
  const gone = posted();
  const stays = posted('Logo design');
  const result = removeListingByTeam(gone.id, 'ada@karwan.site');
  assert.equal(result?.already, false);
  const open = listOpenListings().map((l) => l.id);
  assert.equal(open.includes(gone.id), false);
  assert.equal(open.includes(stays.id), true);
  const kept = getListing(gone.id);
  assert.ok(kept?.cancelledAt);
  assert.ok(kept?.removedByTeamAt);
});

test('removing twice changes nothing, and an unknown offer is not found', () => {
  const listing = posted();
  const first = removeListingByTeam(listing.id, 'ada@karwan.site');
  const again = removeListingByTeam(listing.id, 'ada@karwan.site');
  assert.equal(again?.already, true);
  assert.equal(again?.listing.removedByTeamAt, first?.listing.removedByTeamAt);
  assert.equal(removeListingByTeam('lst_missing', 'ada@karwan.site'), null);
});

test('an offer the seller withdrew themselves is not marked as removed by the team', async () => {
  const { cancelListing } = await import('../db/listings.js');
  const listing = posted();
  cancelListing(listing.id);
  const result = removeListingByTeam(listing.id, 'ada@karwan.site');
  assert.equal(result?.already, true);
  assert.equal(getListing(listing.id)?.removedByTeamAt, undefined);
});

test('who removed an offer stays out of what the market shows', () => {
  const listing = posted();
  removeListingByTeam(listing.id, 'ada@karwan.site');
  const shown = publicListing(getListing(listing.id)!) as Record<string, unknown>;
  assert.equal('removedBy' in shown, false);
});

test('only the team can remove an offer', async () => {
  const listing = posted();
  const res = await listingsRoutes.request(`/${listing.id}/remove`, { method: 'POST' });
  // Refused without the desk (503 when none is configured).
  assert.notEqual(res.status, 200);
  assert.notEqual(res.status, 404);
  assert.equal(getListing(listing.id)?.cancelledAt, undefined);
});

test('the route belongs to a desk page and is in the route list', () => {
  assert.notEqual(routeRule('POST', '/api/listings/x/remove').kind, 'none');
  const snapshot = readFileSync(resolve(REPO_BACKEND, '../frontend/features/admin/backendRouteSnapshot.generated.ts'), 'utf8');
  assert.match(snapshot, /\{ method: "POST", path: "\/api\/listings\/:id\/remove" \}/);
});
