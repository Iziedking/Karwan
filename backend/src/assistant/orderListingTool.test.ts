import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssistantAction, ConfirmAction } from './actions.js';

/// The assistant orders a listing the way the Order button does (view 44, D10):
/// one card with the listing's own terms and its id, so the seller's agent can
/// accept it at once.
///
///   node ../scripts/run-tests.mjs src/assistant/orderListingTool.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-order-tool-')));
delete process.env.DATABASE_URL;

const { createListing, cancelListing } = await import('../db/listings.js');
const { upsertProfile } = await import('../db/profiles.js');
const { directDealTools } = await import('./directDealTools.js');
const { createSchema } = await import('../deals/createSchema.js');

const ADA = '0x00000000000000000000000000000000000000ad';
const BOLA = '0x00000000000000000000000000000000000000b0';
const call = { toolCallId: 't1', messages: [] };
const fee = async () => 100;

test('an open listing becomes one order card with its own terms and its id', async () => {
  await upsertProfile({ address: BOLA, role: 'seller', displayName: 'Bola Ade', handle: 'bola_designs' } as never);
  const l = createListing({
    sellerUser: BOLA, sellerAgent: '0x00000000000000000000000000000000000000b1', title: 'Logo design', description: 'Three concepts.', askingPriceUsdc: 120, readyInDays: 3,
    terms: 'Three logo concepts. Two rounds of changes.',
    termsDraft: { conditions: [], proof: 'link', parts: [{ pct: 50, what: 'Concepts' }, { pct: 50, what: 'Files' }], reviewWindowDays: 2 },
  });
  const actions: AssistantAction[] = [];
  const out = (await directDealTools(ADA, actions, 'conv-1', fee).order_listing.execute!({ listingId: l.id }, call)) as { ok?: boolean };
  assert.equal(out.ok, true);
  assert.equal(actions.length, 1);
  const card = actions[0] as ConfirmAction;
  assert.equal(card.intent, 'create_direct_deal');
  const body = card.payload as Record<string, unknown>;
  assert.equal(body.listingId, l.id);
  assert.equal(body.sellerAddress, BOLA);
  assert.equal(body.dealAmountUsdc, 120);
  assert.equal(body.deadlineDays, 3);
  assert.deepEqual(body.milestonePcts, [50, 50]);
  assert.equal(createSchema.safeParse(body).success, true);
  assert.match(card.title, /Order/);
  assert.ok(card.fields?.some((f) => f.value.includes('120.6')));
});

test('a closed listing, or your own, is not ordered', async () => {
  const l = createListing({ sellerUser: BOLA, sellerAgent: '0x00000000000000000000000000000000000000b1', title: 'Old offer', description: 'Gone.', askingPriceUsdc: 50 });
  cancelListing(l.id);
  const actions: AssistantAction[] = [];
  const closed = (await directDealTools(ADA, actions, undefined, fee).order_listing.execute!({ listingId: l.id }, call)) as { error?: string };
  assert.match(closed.error ?? '', /no longer open/);
  const mine = createListing({ sellerUser: ADA, sellerAgent: '0x00000000000000000000000000000000000000a1', title: 'Mine', description: 'My offer.', askingPriceUsdc: 10 });
  const own = (await directDealTools(ADA, actions, undefined, fee).order_listing.execute!({ listingId: mine.id }, call)) as { error?: string };
  assert.match(own.error ?? '', /your own/);
  assert.equal(actions.length, 0);
});

test('a goods offer another open order holds is still ordered, but the card says the seller decides', async () => {
  const l = createListing({ sellerUser: BOLA, sellerAgent: '0x00000000000000000000000000000000000000b1', title: 'Used phone', description: 'One phone.', askingPriceUsdc: 150, deliveryKind: 'goods' });
  const { createDeal } = await import('../db/deals.js');
  const { setListingOrder } = await import('../db/listings.js');
  const jobId = `0x${'cd'.repeat(32)}`;
  await createDeal({ jobId, buyer: '0x00000000000000000000000000000000000000c0', seller: BOLA, dealAmountUsdc: '150', firstReleasePct: 100, terms: 'Used phone', termsDigest: '0x', acceptanceDeadlineUnix: Math.floor(Date.now() / 1000) + 3600, sellerApprovedAt: Date.now(), origin: 'direct' } as never);
  setListingOrder(l.id, jobId);
  const actions: AssistantAction[] = [];
  const out = (await directDealTools(ADA, actions, undefined, fee).order_listing.execute!({ listingId: l.id }, call)) as { waitsForSeller?: boolean };
  assert.equal(out.waitsForSeller, true);
  assert.match((actions[0] as ConfirmAction).summary ?? '', /already ordered this/);
});
