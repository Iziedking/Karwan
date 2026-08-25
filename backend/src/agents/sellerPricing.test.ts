import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobContext } from '../llm/prompts.js';
import type { SellerProfile } from './seller-profile.js';
import { addressFraction, sellerDaysToDeadline, sellerOpeningBid } from './sellerPricing.js';

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
  assert.ok(first >= 100 && first <= 120);
  assert.equal(addressFraction(seller.address), addressFraction(seller.address));
});

test('opening pricing preserves floor, ceiling, and impossible-range guards', () => {
  assert.equal(
    sellerOpeningBid({ ...seller, minBudgetUsdc: 120, maxBudgetUsdc: 120 }, job, 'new', 1, undefined, () => 0),
    120,
  );
  const capped = sellerOpeningBid({ ...seller, maxBudgetUsdc: 110 }, job, 'new', 1, undefined, () => 1);
  assert.ok(capped !== null && capped >= 100 && capped <= 110);
  assert.equal(
    sellerOpeningBid({ ...seller, minBudgetUsdc: 130, maxBudgetUsdc: 140 }, job, 'new', 0, undefined, () => 0.5),
    null,
  );
});

test('trusted matching remains no more aggressive than the same ordinary opening', () => {
  const ordinary = sellerOpeningBid(seller, job, 'new', 1, undefined, () => 1);
  const trusted = sellerOpeningBid({ ...seller }, { ...job, trustedMatch: true }, 'new', 1, undefined, () => 1);

  assert.ok(ordinary !== null && trusted !== null);
  assert.ok(trusted <= ordinary);
});

test('deadline calculation is pure and never returns less than one day', () => {
  assert.equal(sellerDaysToDeadline(200_000 + 3 * 86_400 + 10, 200_000), 3);
  assert.equal(sellerDaysToDeadline(200_000 - 1, 200_000), 1);
});
