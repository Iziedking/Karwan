import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleTimingForParty } from './lifecycleMetrics.js';
import type { DirectDeal } from '../db/deals.js';

const base: DirectDeal = {
  jobId: '0xdeal', buyer: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', seller: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', dealAmountUsdc: '100', firstReleasePct: 50, terms: 'service', delivered: true,
  createdAt: 1_000, acceptedAt: 2_000, sellerApprovedAt: 1_500, deliveredAt: 5_000, reviewWindowStartedAt: 7_000, buyerVerifiedAt: 6_000, settledAt: 9_000, updatedAt: 9_000,
};

test('derives party timing from verified lifecycle timestamps', () => {
  const seller = lifecycleTimingForParty([base], base.seller);
  assert.equal(seller.sellerResponseMs, 500);
  assert.equal(seller.sellerCompletionMs, 3_000);
  assert.equal(seller.samples.sellerResponse, 1);
  assert.equal(seller.buyerVerificationMs, null);
  const buyer = lifecycleTimingForParty([base], base.buyer);
  assert.equal(buyer.buyerVerificationMs, 1_000);
  assert.equal(buyer.buyerReleaseMs, 4_000);
  assert.equal(buyer.samples.buyerRelease, 1);
});

test('does not invent timing for missing or reversed timestamps', () => {
  const result = lifecycleTimingForParty([{ ...base, deliveredAt: 8_000, reviewWindowStartedAt: 7_000, settledAt: undefined }], base.buyer);
  assert.equal(result.buyerVerificationMs, null);
  assert.equal(result.buyerReleaseMs, null);
});
