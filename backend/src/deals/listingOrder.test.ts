import assert from 'node:assert/strict';
import test from 'node:test';
import type { Listing } from '../db/listings.js';
import { agentMayAccept, listingOrderMatches, listingOrderTerms } from './listingOrder.js';

/// An order on a listing is the listing as it stands (view 44, D10).
///
///   node ../scripts/run-tests.mjs src/deals/listingOrder.test.ts

const NOW = 1_800_000_000_000;
const seller = '0x00000000000000000000000000000000000000aa';

function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: 'lst_0123456789abcdef',
    sellerUser: seller,
    sellerAgent: '0x00000000000000000000000000000000000000ab',
    title: 'Logo design',
    description: 'Three concepts, two rounds of changes.',
    askingPriceUsdc: 120,
    postedAt: NOW - 1000,
    expiresAt: NOW + 86_400_000,
    readyInDays: 3,
    terms: 'Three logo concepts. Two rounds of changes.',
    termsDraft: { conditions: [], proof: 'link', parts: [{ pct: 50, what: 'Concepts' }, { pct: 50, what: 'Final files' }], reviewWindowDays: 2 },
    ...over,
  };
}

test('a listing is sold as its price, its days, its terms and its parts', () => {
  assert.deepEqual(listingOrderTerms(listing()), {
    dealAmountUsdc: 120,
    deadlineDays: 3,
    terms: 'Three logo concepts. Two rounds of changes.',
    firstReleasePct: 50,
    milestonePcts: [50, 50],
    reviewWindowDays: 2,
  });
  const bare = listingOrderTerms(listing({ readyInDays: undefined, terms: undefined, termsDraft: undefined }));
  assert.equal(bare.deadlineDays, 1);
  assert.equal(bare.terms, 'Logo design\n\nThree concepts, two rounds of changes.');
  assert.equal(bare.firstReleasePct, 100);
  assert.deepEqual(bare.milestonePcts, [100]);
  assert.equal(bare.reviewWindowDays, undefined);
});

test('only the open listing as it stands matches', () => {
  const l = listing();
  const order = { sellerAddress: seller, ...listingOrderTerms(l) };
  assert.deepEqual(listingOrderMatches(order, l, NOW), { ok: true });
  assert.deepEqual(listingOrderMatches({ ...order, sellerAddress: seller.toUpperCase().replace('0X', '0x') }, l, NOW), { ok: true });
  for (const changed of [
    { dealAmountUsdc: 119 },
    { deadlineDays: 2 },
    { terms: 'Something else' },
    { milestonePcts: [100], firstReleasePct: 100 },
    { firstReleasePct: 40 },
    { sellerAddress: '0x00000000000000000000000000000000000000cc' },
    { sellerAddress: undefined },
  ]) {
    assert.deepEqual(listingOrderMatches({ ...order, ...changed }, l, NOW), { ok: false, reason: 'changed' }, JSON.stringify(changed));
  }
  assert.deepEqual(listingOrderMatches(order, listing({ cancelledAt: NOW - 1 }), NOW), { ok: false, reason: 'closed' });
  assert.deepEqual(listingOrderMatches(order, listing({ expiresAt: NOW - 1 }), NOW), { ok: false, reason: 'closed' });
});

test("the seller's agent accepts only inside the seller's limits", () => {
  assert.equal(agentMayAccept({ matches: true, sellerCheckDue: false, sellerAgentLinked: true }), true);
  assert.equal(agentMayAccept({ matches: true, tradeLane: 'service', sellerCheckDue: false, sellerAgentLinked: true }), true);
  assert.equal(agentMayAccept({ matches: true, tradeLane: 'finance', sellerCheckDue: false, sellerAgentLinked: true }), false);
  assert.equal(agentMayAccept({ matches: true, sellerCheckDue: true, sellerAgentLinked: true }), false);
  assert.equal(agentMayAccept({ matches: true, sellerCheckDue: false, sellerAgentLinked: false }), false);
  assert.equal(agentMayAccept({ matches: false, sellerCheckDue: false, sellerAgentLinked: true }), false);
});
