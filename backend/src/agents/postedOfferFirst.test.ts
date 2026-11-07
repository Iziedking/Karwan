import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// A seller who posted an offer for the work is offered at that offer's price,
/// never at a price their agent took from its setup range (Telegram, 7 Nov).

const seller = readFileSync(new URL('./seller.ts', import.meta.url), 'utf8');

test('a new request meets posted offers before the agents price it from their setup range', () => {
  const sweep = seller.slice(seller.indexOf('request matched against the seller index'));
  const offers = sweep.indexOf('scanListingsForBrief(');
  const agents = sweep.indexOf('await evaluateAndBid(seller,');
  assert.ok(offers > 0 && agents > 0, 'both steps are in the sweep');
  assert.ok(offers < agents, 'posted offers bid first');
  assert.ok(offers < sweep.indexOf('if (sellers.length === 0) return;'), 'posted offers are met even when no agent fits');
});

test('an offer posted after the agent bid takes its place while no one has negotiated', () => {
  const listingBid = seller.slice(seller.indexOf('export async function submitListingBid('));
  assert.match(listingBid.slice(0, 2500), /postedOfferOverAgentBid\(/);
  assert.match(listingBid.slice(0, 2500), /if \(step !== 'replace'\)/);
});
