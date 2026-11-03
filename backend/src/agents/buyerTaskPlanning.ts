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

/// An over-cap fallback must earn its premium. A seller that is more expensive
/// and no better on reputation or verified fit than a seller we already tried
/// is economically dominated, so surfacing it as a near-miss would nudge the
/// buyer toward a worse deal after a failed negotiation.
export function isDominatedOverCapFallback(
  candidate: Pick<BuyerTimerBidSnapshot, 'priceUsdc' | 'sellerTier' | 'sellerReputationBps' | 'topicalMatch'>,
  tried: readonly Pick<BuyerTimerBidSnapshot, 'priceUsdc' | 'sellerTier' | 'sellerReputationBps' | 'topicalMatch'>[],
  effectiveCapUsdc: number,
): boolean {
  const candidatePrice = Number(candidate.priceUsdc);
  if (!Number.isFinite(candidatePrice) || candidatePrice <= effectiveCapUsdc) return false;

  const candidateTier = BUYER_TIER_RANK[candidate.sellerTier ?? 'established'];
  const candidateReputation = candidate.sellerReputationBps ?? 5_000;
  const candidateMatch = candidate.topicalMatch;

  return tried.some((previous) => {
    const previousPrice = Number(previous.priceUsdc);
    if (!Number.isFinite(previousPrice) || previousPrice > candidatePrice) return false;

    const previousTier = BUYER_TIER_RANK[previous.sellerTier ?? 'established'];
    const previousReputation = previous.sellerReputationBps ?? 5_000;
    const previousMatch = previous.topicalMatch;
    const reputationDominates =
      previousTier > candidateTier ||
      (previousTier === candidateTier && previousReputation >= candidateReputation);
    if (!reputationDominates) return false;

    // A materially better topical fit can justify paying more. One full match
    // band is the same threshold used by the canonical ranking function.
    const materiallyBetterFit =
      typeof candidateMatch === 'number' &&
      typeof previousMatch === 'number' &&
      candidateMatch >= previousMatch + BUYER_MATCH_BAND_SIZE;
    return !materiallyBetterFit;
  });
}

export function buyerMatchBand(bid: Pick<BuyerTimerBidSnapshot, 'topicalMatch'>): number {
  if (typeof bid.topicalMatch !== 'number') return -1;
  const topBand = Math.ceil(100 / BUYER_MATCH_BAND_SIZE) - 1;
  return Math.min(Math.floor(bid.topicalMatch / BUYER_MATCH_BAND_SIZE), topBand);
}

export function buyerEffectiveCap(
  input: { budgetUsdc: string; negotiationMaxIncreasePct?: number },
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
