import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type BuyerTimerBidSnapshot,
  rankBuyerTimerBids,
  isDominatedOverCapFallback,
} from './buyerTaskPlanning.js';

function bid(
  seller: string,
  priceUsdc: string,
  overrides: Partial<BuyerTimerBidSnapshot> = {},
): BuyerTimerBidSnapshot {
  return {
    seller,
    priceUsdc,
    deadlineUnix: 200_000,
    score: 70,
    sellerTier: 'established',
    completionRate: 0.8,
    velocity24h: 4,
    topicalMatch: 70,
    ...overrides,
  };
}

test('shared ranking is match-first, stable, and does not mutate its inputs', () => {
  const bids = [
    bid('better-price', '80', { topicalMatch: 30, sellerReputationBps: 9_000 }),
    bid('better-fit', '110', { topicalMatch: 90, sellerReputationBps: 4_000 }),
  ];
  const before = structuredClone(bids);
  const ranked = rankBuyerTimerBids(bids, {
    budgetUsdc: '100',
    negotiationMaxIncreasePct: 20,
    trustedMatch: false,
  });
  assert.equal(ranked[0]?.bid.seller, 'better-fit');
  assert.deepEqual(bids, before);
});

test('trusted ranking uses tier, stake, then price inside one match band', () => {
  const ranked = rankBuyerTimerBids(
    [
      bid('cheap-cold', '80', { sellerTier: 'cold', sellerFreeStakeUsdc: 500 }),
      bid('strong-low-stake', '110', { sellerTier: 'strong', sellerFreeStakeUsdc: 1 }),
      bid('strong-high-stake', '115', { sellerTier: 'strong', sellerFreeStakeUsdc: 10 }),
    ],
    { budgetUsdc: '100', negotiationMaxIncreasePct: 20, trustedMatch: true },
  );
  assert.deepEqual(ranked.map(({ bid: item }) => item.seller), [
    'strong-high-stake',
    'strong-low-stake',
    'cheap-cold',
  ]);
});

test('rejects a pricier over-cap fallback when a tried seller is cheaper and better reputed', () => {
  const established = bid('established', '144', {
    sellerTier: 'established',
    sellerReputationBps: 7_900,
    topicalMatch: 70,
  });
  const newSeller = bid('new', '210', {
    sellerTier: 'new',
    sellerReputationBps: 4_000,
    topicalMatch: 80,
  });

  assert.equal(isDominatedOverCapFallback(newSeller, [established], 110.25), true);
});

test('allows an over-cap fallback when its topical fit improves by a full match band', () => {
  const established = bid('established', '144', {
    sellerTier: 'established',
    sellerReputationBps: 7_900,
    topicalMatch: 50,
  });
  const specialist = bid('specialist', '210', {
    sellerTier: 'new',
    sellerReputationBps: 4_000,
    topicalMatch: 75,
  });

  assert.equal(isDominatedOverCapFallback(specialist, [established], 110.25), false);
});
