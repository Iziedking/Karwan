import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobContext } from '../llm/prompts.js';
import type { SellerProfile } from './seller-profile.js';
import { addressFraction, MAX_OFFER_REVISIONS, sellerDaysToDeadline, sellerOpeningBid, sellerRevision } from './sellerPricing.js';

const seller: SellerProfile = {
  walletId: 'wallet-1',
  address: '0x1111111111111111111111111111111111111111',
  userAddress: '0x2222222222222222222222222222222222222222',
  displayName: 'Seller',
  skills: ['research'],
  bio: 'Researcher',
  minBudgetUsdc: 80,
  maxBudgetUsdc: 180,
  minDeadlineDays: 1,
  maxDeadlineDays: 30,
  confidenceThreshold: 0.5,
  keywords: ['research'],
};

const job: JobContext = {
  jobId: '0xjob',
  buyer: '0xbuyer',
  budgetUsdc: '100',
  deadlineUnix: 2_000_000,
  termsHash: '0xterms',
  buyerReputationBps: 5_000,
  negotiationMaxIncreasePct: 20,
};

test('opening pricing is deterministic for an injected random source', () => {
  const first = sellerOpeningBid(seller, job, 'established', 0.5, undefined, () => 0.25);
  const second = sellerOpeningBid(seller, job, 'established', 0.5, undefined, () => 0.25);

  assert.equal(first, second);
  assert.ok(first !== null);
  // Heat 0.5: from 10% under the budget to 27.5% over it.
  assert.ok(first >= 90 && first <= 127.5, String(first));
  assert.equal(addressFraction(seller.address), addressFraction(seller.address));
});

test('the buyer\'s leeway never changes a seller\'s opening, because sellers never see it (view 35)', () => {
  const none = sellerOpeningBid(seller, { ...job, negotiationMaxIncreasePct: 0 }, 'established', 0.5, undefined, () => 0.4);
  const wide = sellerOpeningBid(seller, { ...job, negotiationMaxIncreasePct: 50 }, 'established', 0.5, undefined, () => 0.4);
  assert.equal(none, wide);
});

test('a seller can open below the budget when demand is low, so a cheaper seller can win', () => {
  const low = sellerOpeningBid(seller, job, 'elite', 0, undefined, () => 0);
  assert.ok(low !== null && low < 100, String(low));
  assert.ok(low >= 80, 'never more than 20% under the budget');
});

test('an opening never goes below the seller\'s own minimum or a grounded market price', () => {
  const ownFloor = sellerOpeningBid({ ...seller, minBudgetUsdc: 95 }, job, 'elite', 0, undefined, () => 0);
  assert.ok(ownFloor !== null && ownFloor >= 95, String(ownFloor));
  const market = sellerOpeningBid(seller, job, 'elite', 0, 110, () => 0);
  assert.ok(market !== null && market >= 110, String(market));
});

test('a lowest price above the budget opens at the lowest, never at nothing; the old maximum caps nothing (view 41)', () => {
  assert.equal(sellerOpeningBid({ ...seller, minBudgetUsdc: 120, maxBudgetUsdc: 120 }, job, 'new', 0, undefined, () => 0), 120);
  assert.equal(sellerOpeningBid({ ...seller, minBudgetUsdc: 130, maxBudgetUsdc: 140 }, job, 'new', 0, undefined, () => 0.5), 130);
  const uncapped = sellerOpeningBid({ ...seller, maxBudgetUsdc: 110 }, job, 'new', 1, undefined, () => 1);
  assert.ok(uncapped !== null && uncapped > 110, String(uncapped));
});

test('a goods way priced per item opens from the usual price times the count: the shoe case opens about 96 (view 41)', () => {
  const shoes: SellerProfile = { ...seller, minBudgetUsdc: 30, usualPriceUsdc: 32, pricesPerItem: true };
  const request = { ...job, budgetUsdc: '100', quantity: { count: 3, unit: 'pairs' } };
  const opening = sellerOpeningBid(shoes, request, 'established', 0.5, undefined, () => 0.5);
  // Usual 96 for the order, heat 0.5: between 86.4 and 122.4, never under 90.
  assert.ok(opening !== null && opening >= 90 && opening <= 122.4, String(opening));
  const whole = sellerOpeningBid({ ...shoes, pricesPerItem: false }, request, 'established', 0.5, undefined, () => 0.5);
  assert.ok(whole !== null && whole <= 40.8, String(whole));
});

test('the opening anchors on the usual price, under or over the budget (view 41)', () => {
  const under = sellerOpeningBid({ ...seller, usualPriceUsdc: 60 }, job, 'established', 0.5, undefined, () => 0.5);
  // Heat 0.5 around 60: from 10% under to 27.5% over the usual, all under the 100 budget.
  assert.ok(under !== null && under >= 80 && under <= 76.5 + 10, String(under));
  const over = sellerOpeningBid({ ...seller, usualPriceUsdc: 150 }, job, 'established', 0.5, undefined, () => 0.5);
  assert.ok(over !== null && over >= 135 && over <= 191.25, String(over));
  const floored = sellerOpeningBid({ ...seller, usualPriceUsdc: 85, minBudgetUsdc: 84 }, job, 'elite', 0, undefined, () => 0);
  assert.ok(floored !== null && floored >= 84, String(floored));
  const market = sellerOpeningBid({ ...seller, usualPriceUsdc: 60 }, job, 'elite', 0, 110, () => 0);
  assert.ok(market !== null && market >= 110, String(market));
});

test('trusted matching remains no more aggressive than the same ordinary opening', () => {
  const ordinary = sellerOpeningBid(seller, job, 'new', 1, undefined, () => 1);
  const trusted = sellerOpeningBid({ ...seller }, { ...job, trustedMatch: true }, 'new', 1, undefined, () => 1);

  assert.ok(ordinary !== null && trusted !== null);
  assert.ok(trusted <= ordinary);
});

const revise = (over: Partial<Parameters<typeof sellerRevision>[0]> = {}) =>
  sellerRevision({ standingUsdc: 142.71, floorUsdc: 110, reason: 'request-changed', budgetUsdc: 120, revisionsSoFar: 0, random: () => 0.5, ...over });

test('a revision never goes above the standing offer or below the seller\'s floor', () => {
  const r = revise();
  assert.equal(r.action, 'lower');
  if (r.action === 'lower') assert.ok(r.priceUsdc < 142.71 && r.priceUsdc >= 120, String(r.priceUsdc));
  const tight = revise({ floorUsdc: 140 });
  assert.ok(tight.action !== 'lower' || tight.priceUsdc >= 140);
});

test('a seller keeps the offer at the fourth revision', () => {
  assert.deepEqual(revise({ revisionsSoFar: MAX_OFFER_REVISIONS }), { action: 'keep' });
});

test('a seller keeps an offer already at or under the budget, or already at their floor', () => {
  assert.deepEqual(revise({ standingUsdc: 118 }), { action: 'keep' });
  assert.deepEqual(revise({ floorUsdc: 142.71 }), { action: 'keep' });
});

test('a seller withdraws only when their floor is past three times the budget', () => {
  assert.deepEqual(revise({ floorUsdc: 361, standingUsdc: 400 }), { action: 'withdraw' });
  assert.notDeepEqual(revise({ floorUsdc: 300, standingUsdc: 400 }), { action: 'withdraw' });
});

test('best and final moves toward the lowest other offer, never past the seller\'s floor', () => {
  const r = revise({ reason: 'best-and-final', standingUsdc: 118, lowestOtherUsdc: 100, floorUsdc: 105 });
  assert.equal(r.action, 'lower');
  if (r.action === 'lower') assert.ok(r.priceUsdc < 118 && r.priceUsdc >= 105, String(r.priceUsdc));
});

test('the same random gives the same answer, and different sellers move by different steps', () => {
  assert.deepEqual(revise({ random: () => 0.2 }), revise({ random: () => 0.2 }));
  assert.notDeepEqual(revise({ random: () => 0 }), revise({ random: () => 1 }));
});

test('deadline calculation is pure and never returns less than one day', () => {
  assert.equal(sellerDaysToDeadline(200_000 + 3 * 86_400 + 10, 200_000), 3);
  assert.equal(sellerDaysToDeadline(200_000 - 1, 200_000), 1);
});
