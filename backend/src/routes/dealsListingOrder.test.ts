import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import type { KarwanEvent } from '../events.js';
import { contentFor } from '../emails/dealNotifier.js';
import { dealsRoutes } from './deals.js';

/// An order of a listing as it stands is accepted by the seller's agent in the
/// same request (view 44, D10); anything else is refused before a deal exists.
///
///   node ../scripts/run-tests.mjs src/routes/dealsListingOrder.test.ts

const BUYER = `0x${'11'.repeat(20)}`;
const SELLER = `0x${'22'.repeat(20)}`;
const source = await readFile(new URL('./deals.ts', import.meta.url), 'utf8');
const create = source.slice(source.indexOf("dealsRoutes.post('/direct', async"), source.indexOf("dealsRoutes.post('/direct/:jobId/edit'"));

test('a listing order needs the buyer session like any other deal', async () => {
  const res = await dealsRoutes.request('/direct', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ buyerAddress: BUYER, sellerAddress: SELLER, dealAmountUsdc: 120, deadlineDays: 3, terms: 'Logo', firstReleasePct: 100, listingId: 'lst_0123456789abcdef' }),
  });
  assert.equal(res.status, 403);
});

test('an order that is not the listing is refused before anything is created', () => {
  const check = create.indexOf('listingOrderMatches(body, listing, Date.now())');
  assert.ok(check > 0 && check < create.indexOf('await createDeal('));
  for (const code of ['LISTING_CLOSED', 'LISTING_CHANGED', 'OWN_LISTING']) assert.match(create, new RegExp(`code: '${code}'`));
});

test("the seller's agent accepts before anyone is told, and the response says so", () => {
  const accept = create.indexOf('await acceptAsSellerAgent(deal, orderedListing)');
  assert.ok(accept > create.indexOf('await createDeal(') && accept < create.indexOf("type: 'deal.direct.created'"));
  assert.match(create, /listingId: orderedListing\.id, agentAccepted/);
  assert.match(create, /byAgent: true/);
  assert.match(create, /agentAccepted,\n/);
  const helper = source.slice(source.indexOf('async function acceptAsSellerAgent'), source.indexOf("dealsRoutes.post('/direct/:jobId/accept'"));
  assert.match(helper, /agentMayAccept\(\{/);
  assert.match(helper, /sellerCheckDue: highSignalGate\(deal, 'seller'\) !== null/);
  assert.match(helper, /listing\.sellerAgent\.toLowerCase\(\)/);
  assert.match(helper, /approveSellerAgreement\(jobId, version, digest/);
});

test('the seller hears their agent accepted; the paying buyer gets no "review and fund" email', () => {
  const created = { type: 'deal.direct.created', jobId: '0xjob', actor: 'buyer', ts: 0, payload: { buyer: BUYER, seller: SELLER, dealAmountUsdc: '120', listingId: 'lst_0123456789abcdef', agentAccepted: true } } as unknown as KarwanEvent;
  const toSeller = contentFor(created, 'seller', 'service');
  assert.ok(toSeller);
  assert.match(toSeller.subject, /ordered your offer/);
  assert.match(toSeller.body, /your agent accepted it/);
  const approved = { type: 'deal.seller-approved', jobId: '0xjob', actor: 'seller', ts: 0, payload: { buyer: BUYER, seller: SELLER, dealAmountUsdc: '120', byAgent: true } } as unknown as KarwanEvent;
  assert.equal(contentFor(approved, 'buyer', 'service'), null);
});
