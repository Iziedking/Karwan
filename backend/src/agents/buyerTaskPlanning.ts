import {
  relationshipScoreFromDeals,
  scoreBidDeterministic,
  type Tier,
} from './strategy.js';

export interface BuyerTimerBidSnapshot {
  seller: string;
  priceUsdc: string;
  deadlineUnix: number;
  score?: number;
  suggestedCounterPrice?: string;
  suggestedCounterDeadlineDays?: number;
  sellerReputationBps?: number;
  sellerTier?: Tier;
  topicalMatch?: number;
  sellerFreeStakeUsdc?: number;
  completionRate?: number;
  velocity24h?: number;
  priorCleanDealsWithBuyer?: number;
}

export interface BuyerRuntimeSnapshot {
  jobId: string;
  revision: number;
  capturedAt: number;
  budgetUsdc: string;
  negotiationMaxIncreasePct?: number;
  trustedMatch: boolean;
  buyerMinDeadlineDays: number;
  buyerMaxDeadlineDays: number;
  buyerMaxCounterRounds: number;
  bids: BuyerTimerBidSnapshot[];
  candidateQueue: string[];
  triedSellers: string[];
  sellersAtLastPass: string[];
  lastSellerCounterBySeller: Record<string, string>;
  collection: {
    startedAt?: number;
    closeAt?: number;
    scheduleVersion: number;
    fired: boolean;
    pendingEvaluations: number;
    maxWindowMs: number;
    holdRecheckMs: number;
  };
  counter: {
    seller?: string;
    dueAt?: number;
    scheduleVersion: number;
    round?: number;
  };
  parkedAgreement?: {
    seller: string;
    priceUsdc: string;
  };
  finalized: boolean;
  escrowFunded: boolean;
  expired: boolean;
}

export interface CollectionShadowTaskData {
  jobId: string;
  scheduleVersion: number;
  closeAt: number;
}

export interface CounterTimeoutShadowTaskData {
  jobId: string;
  seller: string;
  scheduleVersion: number;
  round: number;
  dueAt: number;
}

export const BUYER_TIER_RANK: Readonly<Record<Tier, number>> = {
  elite: 4,
  strong: 3,
  established: 2,
  cold: 1,
  new: 0,
};

export const BUYER_MATCH_BAND_SIZE = 25;
export const BUYER_REPUTATION_TIEBREAK_EPSILON = 3;
export const BUYER_MAX_CANDIDATES = 3;

export function buyerMatchBand(bid: Pick<BuyerTimerBidSnapshot, 'topicalMatch'>): number {
  if (typeof bid.topicalMatch !== 'number') return -1;
  const topBand = Math.ceil(100 / BUYER_MATCH_BAND_SIZE) - 1;
  return Math.min(Math.floor(bid.topicalMatch / BUYER_MATCH_BAND_SIZE), topBand);
}

export function buyerEffectiveCap(
  input: Pick<BuyerRuntimeSnapshot, 'budgetUsdc' | 'negotiationMaxIncreasePct'>,
): number {
  const budget = Number(input.budgetUsdc);
  const tolerance = input.negotiationMaxIncreasePct ?? 0;
  return budget * (1 + tolerance / 100);
}

export interface RankedBuyerBid<TBid extends BuyerTimerBidSnapshot = BuyerTimerBidSnapshot> {
  bid: TBid;
  deterministicScore: number;
}

export function rankBuyerTimerBids<TBid extends BuyerTimerBidSnapshot>(
  bids: readonly TBid[],
  input: {
    budgetUsdc: string;
    negotiationMaxIncreasePct?: number;
    trustedMatch: boolean;
  },
): RankedBuyerBid<TBid>[] {
  const budget = Number(input.budgetUsdc);
  const effectiveCap = buyerEffectiveCap(input);
  return bids
    .filter((bid) => typeof bid.score === 'number')
    .map((bid) => ({
      bid,
      deterministicScore: scoreBidDeterministic({
        bidPriceUsdc: Number(bid.priceUsdc),
        briefBudgetUsdc: budget,
        effectiveCapUsdc: effectiveCap,
        sellerTier: bid.sellerTier ?? 'established',
        sellerCompletionRate: bid.completionRate,
        sellerVelocity24h: bid.velocity24h,
        relationshipScore: relationshipScoreFromDeals(bid.priorCleanDealsWithBuyer ?? 0),
      }).score,
    }))
    .sort((left, right) => {
      const bandDelta = buyerMatchBand(right.bid) - buyerMatchBand(left.bid);
      if (bandDelta !== 0) return bandDelta;

      if (input.trustedMatch) {
        const leftTier = BUYER_TIER_RANK[left.bid.sellerTier ?? 'established'];
        const rightTier = BUYER_TIER_RANK[right.bid.sellerTier ?? 'established'];
        if (leftTier !== rightTier) return rightTier - leftTier;
        const leftStake = left.bid.sellerFreeStakeUsdc ?? 0;
        const rightStake = right.bid.sellerFreeStakeUsdc ?? 0;
        if (leftStake !== rightStake) return rightStake - leftStake;
        return Number(left.bid.priceUsdc) - Number(right.bid.priceUsdc);
      }

      const scoreDelta = right.deterministicScore - left.deterministicScore;
      if (Math.abs(scoreDelta) < BUYER_REPUTATION_TIEBREAK_EPSILON) {
        const leftReputation = left.bid.sellerReputationBps ?? 5_000;
        const rightReputation = right.bid.sellerReputationBps ?? 5_000;
        if (leftReputation !== rightReputation) return rightReputation - leftReputation;
      }
      return scoreDelta;
    });
}

export type CollectionShadowDecision =
  | { action: 'stale'; reason: 'schedule-replaced' | 'already-finished' }
  | { action: 'waiting'; availableAt: number }
  | { action: 'hold_for_evaluations'; availableAt: number; pendingEvaluations: number }
  | { action: 'no_candidates'; receivedBids: number }
  | {
      action: 'propose_match';
      seller: string;
      priceUsdc: string;
      reason: 'elite-in-cap' | 'strong-near-tie' | 'at-or-under-budget';
      candidateQueue: string[];
    }
  | {
      action: 'issue_counter';
      seller: string;
      counterPriceUsdc: string;
      counterDeadlineDays: number;
      reason: 'cold-discount' | 'above-budget';
      candidateQueue: string[];
    };

export function planCollectionShadow(
  snapshot: BuyerRuntimeSnapshot,
  task: CollectionShadowTaskData,
  now: number,
): CollectionShadowDecision {
  if (
    snapshot.jobId.toLowerCase() !== task.jobId.toLowerCase() ||
    snapshot.collection.scheduleVersion !== task.scheduleVersion ||
    snapshot.collection.closeAt !== task.closeAt
  ) {
    return { action: 'stale', reason: 'schedule-replaced' };
  }
  if (
    snapshot.collection.fired ||
    snapshot.finalized ||
    snapshot.escrowFunded ||
    snapshot.expired
  ) {
    return { action: 'stale', reason: 'already-finished' };
  }
  if (now < task.closeAt) return { action: 'waiting', availableAt: task.closeAt };

  const startedAt = snapshot.collection.startedAt ?? task.closeAt;
  if (
    snapshot.collection.pendingEvaluations > 0 &&
    now < startedAt + snapshot.collection.maxWindowMs
  ) {
    return {
      action: 'hold_for_evaluations',
      availableAt: now + snapshot.collection.holdRecheckMs,
      pendingEvaluations: snapshot.collection.pendingEvaluations,
    };
  }

  const tried = new Set(snapshot.triedSellers.map((seller) => seller.toLowerCase()));
  const ranked = rankBuyerTimerBids(snapshot.bids, snapshot)
    .filter(({ bid }) => !tried.has(bid.seller.toLowerCase()));
  if (ranked.length === 0) {
    return { action: 'no_candidates', receivedBids: snapshot.bids.length };
  }

  const candidateQueue = ranked
    .slice(0, BUYER_MAX_CANDIDATES)
    .map(({ bid }) => bid.seller);
  const top = ranked[0]!.bid;
  const topPrice = Number(top.priceUsdc);
  const budget = Number(snapshot.budgetUsdc);
  const effectiveCap = buyerEffectiveCap(snapshot);
  const tier = top.sellerTier ?? 'established';

  if (tier === 'elite' && topPrice <= effectiveCap) {
    return {
      action: 'propose_match',
      seller: top.seller,
      priceUsdc: top.priceUsdc,
      reason: 'elite-in-cap',
      candidateQueue,
    };
  }
  if (tier === 'strong' && ranked.length >= 2 && topPrice <= budget) {
    const secondPrice = Number(ranked[1]!.bid.priceUsdc);
    if (secondPrice > 0 && Math.abs(topPrice - secondPrice) / secondPrice <= 0.05) {
      return {
        action: 'propose_match',
        seller: top.seller,
        priceUsdc: top.priceUsdc,
        reason: 'strong-near-tie',
        candidateQueue,
      };
    }
  }
  if (tier === 'cold' && topPrice <= budget && topPrice * 0.95 >= 1) {
    return {
      action: 'issue_counter',
      seller: top.seller,
      counterPriceUsdc: (topPrice * 0.95).toFixed(2),
      counterDeadlineDays: boundedCounterDeadlineDays(snapshot, top, now),
      reason: 'cold-discount',
      candidateQueue,
    };
  }
  if (topPrice <= budget) {
    return {
      action: 'propose_match',
      seller: top.seller,
      priceUsdc: top.priceUsdc,
      reason: 'at-or-under-budget',
      candidateQueue,
    };
  }
  return {
    action: 'issue_counter',
    seller: top.seller,
    counterPriceUsdc: top.suggestedCounterPrice ?? budget.toFixed(2),
    counterDeadlineDays:
      top.suggestedCounterDeadlineDays ?? boundedCounterDeadlineDays(snapshot, top, now),
    reason: 'above-budget',
    candidateQueue,
  };
}

function boundedCounterDeadlineDays(
  snapshot: BuyerRuntimeSnapshot,
  bid: BuyerTimerBidSnapshot,
  now: number,
): number {
  return Math.max(
    snapshot.buyerMinDeadlineDays,
    Math.min(
      snapshot.buyerMaxDeadlineDays,
      Math.floor((bid.deadlineUnix - Math.floor(now / 1_000)) / 86_400),
    ),
  );
}

export type CounterTimeoutShadowDecision =
  | { action: 'stale'; reason: 'schedule-replaced' | 'already-finished' | 'seller-already-answered' }
  | { action: 'waiting'; availableAt: number }
  | { action: 'propose_parked'; seller: string; priceUsdc: string; timedOutSeller: string }
  | { action: 'next_candidate'; timedOutSeller: string; nextSeller: string }
  | {
      action: 'evaluate_walk_end_near_miss';
      timedOutSeller: string;
      seller: string;
      lastPriceUsdc: string;
      buyerCeilingUsdc: number;
    }
  | { action: 'exhausted'; timedOutSeller: string };

export function planCounterTimeoutShadow(
  snapshot: BuyerRuntimeSnapshot,
  task: CounterTimeoutShadowTaskData,
  now: number,
): CounterTimeoutShadowDecision {
  const watchedSeller = task.seller.toLowerCase();
  if (
    snapshot.jobId.toLowerCase() !== task.jobId.toLowerCase() ||
    snapshot.counter.scheduleVersion !== task.scheduleVersion ||
    snapshot.counter.seller?.toLowerCase() !== watchedSeller ||
    snapshot.counter.dueAt !== task.dueAt ||
    snapshot.counter.round !== task.round
  ) {
    return { action: 'stale', reason: 'schedule-replaced' };
  }
  if (snapshot.finalized || snapshot.escrowFunded || snapshot.expired) {
    return { action: 'stale', reason: 'already-finished' };
  }
  if (snapshot.triedSellers.some((seller) => seller.toLowerCase() === watchedSeller)) {
    return { action: 'stale', reason: 'seller-already-answered' };
  }
  if (now < task.dueAt) return { action: 'waiting', availableAt: task.dueAt };

  if (
    snapshot.parkedAgreement &&
    snapshot.parkedAgreement.seller.toLowerCase() !== watchedSeller
  ) {
    return {
      action: 'propose_parked',
      seller: snapshot.parkedAgreement.seller,
      priceUsdc: snapshot.parkedAgreement.priceUsdc,
      timedOutSeller: task.seller,
    };
  }

  const tried = new Set(snapshot.triedSellers.map((seller) => seller.toLowerCase()));
  tried.add(watchedSeller);
  const nextSeller = snapshot.candidateQueue.find(
    (seller) => !tried.has(seller.toLowerCase()),
  );
  if (nextSeller) {
    return { action: 'next_candidate', timedOutSeller: task.seller, nextSeller };
  }

  const previousPass = new Set(snapshot.sellersAtLastPass.map((seller) => seller.toLowerCase()));
  let best: { seller: string; lastPriceUsdc: string } | null = null;
  for (const [seller, lastPriceUsdc] of Object.entries(snapshot.lastSellerCounterBySeller)) {
    if (!tried.has(seller.toLowerCase()) || previousPass.has(seller.toLowerCase())) continue;
    const price = Number(lastPriceUsdc);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!best || price < Number(best.lastPriceUsdc)) best = { seller, lastPriceUsdc };
  }
  const buyerCeilingUsdc = buyerEffectiveCap(snapshot);
  if (best && Number(best.lastPriceUsdc) > buyerCeilingUsdc) {
    return {
      action: 'evaluate_walk_end_near_miss',
      timedOutSeller: task.seller,
      seller: best.seller,
      lastPriceUsdc: best.lastPriceUsdc,
      buyerCeilingUsdc,
    };
  }
  return { action: 'exhausted', timedOutSeller: task.seller };
}
