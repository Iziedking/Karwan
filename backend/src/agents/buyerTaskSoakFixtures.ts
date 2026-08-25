import type {
  BuyerRuntimeSnapshot,
  CollectionShadowDecision,
  CollectionShadowTaskData,
  CounterTimeoutShadowDecision,
  CounterTimeoutShadowTaskData,
} from './buyerTaskPlanning.js';
import type { BuyerTimerParitySchedule } from './buyerTaskParity.js';

export const BUYER_TIMER_SOAK_NOW = 1_000;

export interface BuyerTimerSoakFixture {
  name: string;
  snapshot: BuyerRuntimeSnapshot;
  schedule: BuyerTimerParitySchedule;
  legacyDecision: CollectionShadowDecision | CounterTimeoutShadowDecision;
}

function collection(
  jobId: string,
  overrides: Partial<BuyerRuntimeSnapshot> = {},
): BuyerRuntimeSnapshot {
  return {
    jobId,
    revision: 1,
    capturedAt: 900,
    budgetUsdc: '100',
    negotiationMaxIncreasePct: 20,
    trustedMatch: false,
    buyerMinDeadlineDays: 1,
    buyerMaxDeadlineDays: 30,
    buyerMaxCounterRounds: 3,
    bids: [],
    candidateQueue: [],
    triedSellers: [],
    sellersAtLastPass: [],
    lastSellerCounterBySeller: {},
    collection: {
      startedAt: 500,
      closeAt: 900,
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

function counter(
  jobId: string,
  overrides: Partial<BuyerRuntimeSnapshot> = {},
): BuyerRuntimeSnapshot {
  return {
    ...collection(jobId),
    collection: {
      ...collection(jobId).collection,
      closeAt: undefined,
      scheduleVersion: 0,
    },
    counter: {
      seller: 'seller-a',
      dueAt: 900,
      scheduleVersion: 1,
      round: 1,
    },
    ...overrides,
  };
}

function collectionSchedule(jobId: string, scheduleVersion = 1): BuyerTimerParitySchedule {
  const data: CollectionShadowTaskData = {
    jobId,
    scheduleVersion,
    closeAt: 900,
  };
  return { kind: 'collection', data };
}

function counterSchedule(jobId: string, scheduleVersion = 1): BuyerTimerParitySchedule {
  const data: CounterTimeoutShadowTaskData = {
    jobId,
    seller: 'seller-a',
    scheduleVersion,
    round: 1,
    dueAt: 900,
  };
  return { kind: 'counter-timeout', data };
}

export const BUYER_TIMER_SOAK_FIXTURES: readonly BuyerTimerSoakFixture[] = [
  {
    name: 'collection-no-bids',
    snapshot: collection('soak-no-bids'),
    schedule: collectionSchedule('soak-no-bids'),
    legacyDecision: { action: 'no_candidates', receivedBids: 0 },
  },
  {
    name: 'collection-elite-match',
    snapshot: collection('soak-elite-match', {
      bids: [{
        seller: 'seller-elite',
        priceUsdc: '110',
        deadlineUnix: 3_000_000,
        score: 91,
        sellerTier: 'elite',
        topicalMatch: 90,
      }],
    }),
    schedule: collectionSchedule('soak-elite-match'),
    legacyDecision: {
      action: 'propose_match',
      seller: 'seller-elite',
      priceUsdc: '110',
      reason: 'elite-in-cap',
      candidateQueue: ['seller-elite'],
    },
  },
  {
    name: 'collection-strong-near-tie',
    snapshot: collection('soak-strong-near-tie', {
      bids: [
        {
          seller: 'seller-strong-a',
          priceUsdc: '90',
          deadlineUnix: 3_000_000,
          score: 90,
          sellerTier: 'strong',
          topicalMatch: 80,
        },
        {
          seller: 'seller-strong-b',
          priceUsdc: '92',
          deadlineUnix: 3_000_000,
          score: 88,
          sellerTier: 'established',
          topicalMatch: 80,
        },
      ],
    }),
    schedule: collectionSchedule('soak-strong-near-tie'),
    legacyDecision: {
      action: 'propose_match',
      seller: 'seller-strong-a',
      priceUsdc: '90',
      reason: 'strong-near-tie',
      candidateQueue: ['seller-strong-a', 'seller-strong-b'],
    },
  },
  {
    name: 'collection-cold-counter',
    snapshot: collection('soak-cold-counter', {
      bids: [{
        seller: 'seller-cold',
        priceUsdc: '90',
        deadlineUnix: 3_000_000,
        score: 75,
        sellerTier: 'cold',
        topicalMatch: 75,
      }],
    }),
    schedule: collectionSchedule('soak-cold-counter'),
    legacyDecision: {
      action: 'issue_counter',
      seller: 'seller-cold',
      counterPriceUsdc: '85.50',
      counterDeadlineDays: 30,
      reason: 'cold-discount',
      candidateQueue: ['seller-cold'],
    },
  },
  {
    name: 'collection-above-budget-counter',
    snapshot: collection('soak-above-budget', {
      bids: [{
        seller: 'seller-over',
        priceUsdc: '130',
        deadlineUnix: 3_000_000,
        score: 75,
        sellerTier: 'established',
        topicalMatch: 75,
      }],
    }),
    schedule: collectionSchedule('soak-above-budget'),
    legacyDecision: {
      action: 'issue_counter',
      seller: 'seller-over',
      counterPriceUsdc: '100.00',
      counterDeadlineDays: 30,
      reason: 'above-budget',
      candidateQueue: ['seller-over'],
    },
  },
  {
    name: 'collection-hold-for-evaluations',
    snapshot: collection('soak-evaluation-hold', {
      bids: [{
        seller: 'seller-evaluating',
        priceUsdc: '95',
        deadlineUnix: 3_000_000,
        score: 80,
        sellerTier: 'established',
        topicalMatch: 75,
      }],
      collection: {
        startedAt: 500,
        closeAt: 900,
        scheduleVersion: 1,
        fired: false,
        pendingEvaluations: 1,
        maxWindowMs: 5_000,
        holdRecheckMs: 300,
      },
    }),
    schedule: collectionSchedule('soak-evaluation-hold'),
    legacyDecision: {
      action: 'hold_for_evaluations',
      availableAt: 1_300,
      pendingEvaluations: 1,
    },
  },
  {
    name: 'counter-parked-fallback',
    snapshot: counter('soak-parked', {
      parkedAgreement: { seller: 'seller-parked', priceUsdc: '98' },
    }),
    schedule: counterSchedule('soak-parked'),
    legacyDecision: {
      action: 'propose_parked',
      seller: 'seller-parked',
      priceUsdc: '98',
      timedOutSeller: 'seller-a',
    },
  },
  {
    name: 'counter-next-candidate',
    snapshot: counter('soak-next', { candidateQueue: ['seller-next'] }),
    schedule: counterSchedule('soak-next'),
    legacyDecision: {
      action: 'next_candidate',
      timedOutSeller: 'seller-a',
      nextSeller: 'seller-next',
    },
  },
  {
    name: 'counter-near-miss',
    snapshot: counter('soak-near-miss', {
      triedSellers: [],
      lastSellerCounterBySeller: { 'seller-a': '130' },
    }),
    schedule: counterSchedule('soak-near-miss'),
    legacyDecision: {
      action: 'evaluate_walk_end_near_miss',
      timedOutSeller: 'seller-a',
      seller: 'seller-a',
      lastPriceUsdc: '130',
      buyerCeilingUsdc: 120,
    },
  },
  {
    name: 'counter-exhausted',
    snapshot: counter('soak-exhausted', {
      triedSellers: [],
      lastSellerCounterBySeller: { 'seller-a': '110' },
    }),
    schedule: counterSchedule('soak-exhausted'),
    legacyDecision: { action: 'exhausted', timedOutSeller: 'seller-a' },
  },
  {
    name: 'counter-already-answered',
    snapshot: counter('soak-answered', { triedSellers: ['seller-a'] }),
    schedule: counterSchedule('soak-answered'),
    legacyDecision: { action: 'stale', reason: 'seller-already-answered' },
  },
];

export const BUYER_TIMER_SOAK_STALE_FIXTURES = {
  old: {
    snapshot: collection('soak-stale-generation', {
      collection: {
        startedAt: 500,
        closeAt: 900,
        scheduleVersion: 1,
        fired: false,
        pendingEvaluations: 0,
        maxWindowMs: 5_000,
        holdRecheckMs: 300,
      },
    }),
    schedule: collectionSchedule('soak-stale-generation', 1),
  },
  current: {
    snapshot: collection('soak-stale-generation', {
      revision: 2,
      bids: [{
        seller: 'seller-current',
        priceUsdc: '90',
        deadlineUnix: 3_000_000,
        score: 80,
        sellerTier: 'established',
        topicalMatch: 80,
      }],
      collection: {
        startedAt: 500,
        closeAt: 900,
        scheduleVersion: 2,
        fired: false,
        pendingEvaluations: 0,
        maxWindowMs: 5_000,
        holdRecheckMs: 300,
      },
    }),
    schedule: collectionSchedule('soak-stale-generation', 2),
    legacyDecision: {
      action: 'propose_match' as const,
      seller: 'seller-current',
      priceUsdc: '90',
      reason: 'at-or-under-budget' as const,
      candidateQueue: ['seller-current'],
    },
  },
} as const;
