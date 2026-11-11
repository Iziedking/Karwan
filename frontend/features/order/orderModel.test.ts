import assert from 'node:assert/strict';
import test from 'node:test';
import type { Listing, ListingQuote } from '@/core/api';
import { orderPhase, orderTermsOf, shortByUsdc, shortfallUsdc, spendableUsdc } from './orderModel';

/// Where an order stands on its review page (view 44, Figma 05 to 09).
///
///   npx tsx --test features/order/orderModel.test.ts

const quote: ListingQuote = { priceUsdc: '120', feeUsdc: '0.6', youPayUsdc: '120.6', feeBps: 100, deliverByUnix: 1_800_000_000, parts: 1 };

test('the review says what to do next from the quote and the money in place', () => {
  assert.equal(orderPhase({ quote: null, spendableUsdc: null, busy: false }), 'review');
  assert.equal(orderPhase({ quote, spendableUsdc: null, busy: false }), 'review');
  assert.equal(orderPhase({ quote, spendableUsdc: 100, busy: false }), 'short');
  assert.equal(orderPhase({ quote, spendableUsdc: 120.6, busy: false }), 'ready');
  assert.equal(orderPhase({ quote, spendableUsdc: 150, busy: false }), 'ready');
  assert.equal(orderPhase({ quote, spendableUsdc: 150, busy: true }), 'paying');
  assert.equal(orderPhase({ quote, quoteError: 'CLOSED', spendableUsdc: 150, busy: false }), 'closed');
  assert.equal(orderPhase({ quote, quoteError: 'CHANGED', spendableUsdc: 150, busy: false }), 'changed');
  assert.equal(orderPhase({ quote: null, quoteError: 'OWN', spendableUsdc: null, busy: false }), 'own');
});

test('what can pay is your balance and your buying agent, once both are read', () => {
  assert.equal(spendableUsdc({ balance: null, buyer: 5 }), null);
  assert.equal(spendableUsdc({ balance: 5, buyer: null }), null);
  assert.equal(spendableUsdc({ balance: 100, buyer: 0.04 }), 100.04);
});

test('the money to add is what is missing, rounded up to the cent', () => {
  assert.equal(shortfallUsdc('120.6', 100.04), '20.56');
  assert.equal(shortfallUsdc('120.6', 100.045), '20.56');
  assert.equal(shortfallUsdc('120.6', 120.6), '0');
  assert.equal(shortfallUsdc('120.6', 0), '120.6');
});

test('an order is the listing as the server sells it (backend deals/listingOrder.ts)', () => {
  const base = { id: 'lst_0123456789abcdef', sellerUser: '0xaa', sellerAgent: '0xab', title: 'Logo design', description: 'Three concepts, two rounds of changes.', askingPriceUsdc: 120, postedAt: 0, expiresAt: 1 } as Listing;
  assert.deepEqual(orderTermsOf({ ...base, readyInDays: 3, terms: 'Three logo concepts.', termsDraft: { conditions: [], proof: 'link', parts: [{ pct: 50, what: 'a' }, { pct: 50, what: 'b' }], reviewWindowDays: 2 } }), {
    dealAmountUsdc: 120, deadlineDays: 3, terms: 'Three logo concepts.', firstReleasePct: 50, milestonePcts: [50, 50], reviewWindowDays: 2,
  });
  assert.deepEqual(orderTermsOf(base), {
    dealAmountUsdc: 120, deadlineDays: 1, terms: 'Logo design\n\nThree concepts, two rounds of changes.', firstReleasePct: 100, milestonePcts: [100],
  });
});

test('the gap said beside the balance is exactly pay less balance, not the rounded top-up (T-13, 11 Nov)', () => {
  assert.equal(shortByUsdc('50.224517', 19.987372), '30.237145');
  assert.equal(shortfallUsdc('50.224517', 19.987372), '30.24');
  assert.equal(shortByUsdc('10', 12), '0');
});
