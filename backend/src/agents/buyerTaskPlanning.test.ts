import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type BuyerRuntimeSnapshot,
  type BuyerTimerBidSnapshot,
  planCollectionShadow,
  planCounterTimeoutShadow,
  rankBuyerTimerBids,
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

function snapshot(overrides: Partial<BuyerRuntimeSnapshot> = {}): BuyerRuntimeSnapshot {
  return {
    jobId: 'job-1',
    revision: 1,
    capturedAt: 900,
    budgetUsdc: '100',
    negotiationMaxIncreasePct: 20,
    trustedMatch: false,
    buyerMinDeadlineDays: 1,
    buyerMaxDeadlineDays: 30,
    buyerMaxCounterRounds: 3,
    bids: [bid('seller-a', '110', { suggestedCounterPrice: '105' })],
    candidateQueue: [],
    triedSellers: [],
    sellersAtLastPass: [],
    lastSellerCounterBySeller: {},
    collection: {
      startedAt: 500,
      closeAt: 1_000,
      scheduleVersion: 1,
      fired: false,
      pendingEvaluations: 0,
      maxWindowMs: 5_000,
      holdRecheckMs: 300,
    },
    counter: { scheduleVersion: 0 },
    finalized: false,
    escrowFunded: false,
    expired: false,
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

test('collection planning fences replaced schedules and holds only before the cap', () => {
  const current = snapshot({
    collection: {
      startedAt: 500,
      closeAt: 1_000,
      scheduleVersion: 2,
      fired: false,
      pendingEvaluations: 2,
      maxWindowMs: 5_000,
      holdRecheckMs: 300,
    },
  });
  assert.deepEqual(
    planCollectionShadow(current, { jobId: 'job-1', scheduleVersion: 1, closeAt: 1_000 }, 1_000),
    { action: 'stale', reason: 'schedule-replaced' },
  );
  assert.deepEqual(
    planCollectionShadow(current, { jobId: 'job-1', scheduleVersion: 2, closeAt: 1_000 }, 1_000),
    { action: 'hold_for_evaluations', availableAt: 1_300, pendingEvaluations: 2 },
  );
  assert.equal(
    planCollectionShadow(current, { jobId: 'job-1', scheduleVersion: 2, closeAt: 1_000 }, 5_500).action,
    'issue_counter',
  );
});

test('collection planning preserves the legacy direct and counter branches', () => {
  const task = { jobId: 'job-1', scheduleVersion: 1, closeAt: 1_000 };
  const cases: Array<{ state: BuyerRuntimeSnapshot; action: string; reason?: string }> = [
    {
      state: snapshot({ bids: [bid('elite', '120', { sellerTier: 'elite' })] }),
      action: 'propose_match',
      reason: 'elite-in-cap',
    },
    {
      state: snapshot({
        bids: [
          bid('strong', '98', { sellerTier: 'strong' }),
          bid('runner-up', '100', { sellerTier: 'established' }),
        ],
      }),
      action: 'propose_match',
      reason: 'strong-near-tie',
    },
    {
      state: snapshot({ bids: [bid('cold', '80', { sellerTier: 'cold' })] }),
      action: 'issue_counter',
      reason: 'cold-discount',
    },
    {
      state: snapshot({ bids: [bid('ordinary', '90')] }),
      action: 'propose_match',
      reason: 'at-or-under-budget',
    },
    {
      state: snapshot({ bids: [bid('counter', '110', { suggestedCounterPrice: undefined })] }),
      action: 'issue_counter',
      reason: 'above-budget',
    },
  ];
  for (const item of cases) {
    const decision = planCollectionShadow(item.state, task, 1_000);
    assert.equal(decision.action, item.action);
    if ('reason' in decision) assert.equal(decision.reason, item.reason);
  }
});

test('collection planning distinguishes no bids from unevaluated bids', () => {
  const task = { jobId: 'job-1', scheduleVersion: 1, closeAt: 1_000 };
  assert.deepEqual(
    planCollectionShadow(snapshot({ bids: [] }), task, 1_000),
    { action: 'no_candidates', receivedBids: 0 },
  );
  assert.deepEqual(
    planCollectionShadow(snapshot({ bids: [bid('unscored', '90', { score: undefined })] }), task, 1_000),
    { action: 'no_candidates', receivedBids: 1 },
  );
});

function counterSnapshot(overrides: Partial<BuyerRuntimeSnapshot> = {}): BuyerRuntimeSnapshot {
  return snapshot({
    candidateQueue: ['seller-a', 'seller-b'],
    counter: { seller: 'seller-a', dueAt: 2_000, scheduleVersion: 1, round: 1 },
    ...overrides,
  });
}

const counterTask = {
  jobId: 'job-1',
  seller: 'seller-a',
  scheduleVersion: 1,
  round: 1,
  dueAt: 2_000,
};

test('counter planning fences replies and projects the next candidate', () => {
  assert.deepEqual(planCounterTimeoutShadow(counterSnapshot(), counterTask, 1_999), {
    action: 'waiting',
    availableAt: 2_000,
  });
  assert.deepEqual(planCounterTimeoutShadow(counterSnapshot(), counterTask, 2_000), {
    action: 'next_candidate',
    timedOutSeller: 'seller-a',
    nextSeller: 'seller-b',
  });
  assert.deepEqual(
    planCounterTimeoutShadow(counterSnapshot({ triedSellers: ['seller-a'] }), counterTask, 2_000),
    { action: 'stale', reason: 'seller-already-answered' },
  );
});

test('counter planning preserves parked fallback and walk-end outcomes', () => {
  assert.deepEqual(
    planCounterTimeoutShadow(
      counterSnapshot({ parkedAgreement: { seller: 'parked', priceUsdc: '95' } }),
      counterTask,
      2_000,
    ),
    {
      action: 'propose_parked',
      seller: 'parked',
      priceUsdc: '95',
      timedOutSeller: 'seller-a',
    },
  );

  const exhausted = counterSnapshot({
    candidateQueue: ['seller-a'],
    lastSellerCounterBySeller: { 'seller-a': '130' },
  });
  assert.deepEqual(planCounterTimeoutShadow(exhausted, counterTask, 2_000), {
    action: 'evaluate_walk_end_near_miss',
    timedOutSeller: 'seller-a',
    seller: 'seller-a',
    lastPriceUsdc: '130',
    buyerCeilingUsdc: 120,
  });
  assert.deepEqual(
    planCounterTimeoutShadow(
      { ...exhausted, lastSellerCounterBySeller: { 'seller-a': '90' } },
      counterTask,
      2_000,
    ),
    { action: 'exhausted', timedOutSeller: 'seller-a' },
  );
});
