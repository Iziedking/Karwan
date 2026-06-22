/// Pure strategy helpers used by the buyer and seller agents.
///
/// The LLM is in charge of writing the *reasoning* trace and picking
/// nuanced moves inside the safe envelope. These functions are in charge
/// of producing a deterministic price target the LLM can ratify or refine,
/// and providing a deterministic fallback when the LLM call fails or
/// returns malformed JSON.
///
/// Two design notes:
/// - Concession decay: the further into the negotiation we are, the smaller
///   the concession step. Round 0 concedes 50% of the remaining gap, round
///   1 concedes 25%, round 2 concedes 10%. This mirrors how human
///   negotiators signal "I'm running out of room."
/// - Tier elasticity: stronger counterparties earn a small concession boost
///   (we trust them to deliver), weaker counterparties get less. The boost
///   is bounded so it never overrides the role's floor / ceiling.
///
/// All numbers are USDC-denominated, formatted to 2 decimals on return.

export type Role = 'buyer' | 'seller';
export type Tier = 'new' | 'cold' | 'established' | 'strong' | 'elite';

const DECAY_CURVE = [0.5, 0.25, 0.1, 0.05];

const TIER_ELASTICITY: Record<Tier, number> = {
  // Trust scale. Higher tier = trusted counterparty = willing to bend
  // slightly. The number multiplies the base concession factor.
  new: 0.7,
  cold: 0.85,
  established: 1.0,
  strong: 1.1,
  elite: 1.2,
};

/// Returns the round-N concession factor in (0, 1]. Buyer or seller
/// applies the same curve; tier elasticity nudges it.
export function concessionFactor(round: number, tier: Tier): number {
  const idx = Math.max(0, Math.min(round, DECAY_CURVE.length - 1));
  const base = DECAY_CURVE[idx] ?? DECAY_CURVE[DECAY_CURVE.length - 1] ?? 0.05;
  const elasticity = TIER_ELASTICITY[tier];
  return Math.min(1, base * elasticity);
}

/// Urgency multiplier in (0.8, 1.3] based on days to deadline.
/// Tight deadlines push the agent to concede a bit faster.
export function urgencyFactor(daysToDeadline: number): number {
  if (daysToDeadline <= 1) return 1.3;
  if (daysToDeadline <= 3) return 1.15;
  if (daysToDeadline <= 7) return 1.0;
  if (daysToDeadline <= 21) return 0.9;
  return 0.8;
}

/// Computes a concrete counter price for the next round.
///
/// For a buyer:    mine is the buyer's last counter, theirs is the seller's
///                 latest counter (always >= mine in a healthy negotiation).
///                 The buyer moves up by `factor` of the remaining gap,
///                 clamped to the buyer's ceiling.
///
/// For a seller:   mine is the seller's last counter, theirs is the buyer's
///                 latest counter (always <= mine in a healthy negotiation).
///                 The seller moves down by `factor` of the remaining gap,
///                 clamped to the seller's floor.
export function nextCounterPrice(args: {
  role: Role;
  mine: number;
  theirs: number;
  round: number;
  floor: number;
  ceiling: number;
  tier: Tier;
  daysToDeadline: number;
}): number {
  const factor = concessionFactor(args.round, args.tier) * urgencyFactor(args.daysToDeadline);
  const gap = args.theirs - args.mine;
  const move = gap * Math.min(1, factor);
  const raw = args.mine + move;
  const bounded = Math.max(args.floor, Math.min(args.ceiling, raw));
  return Number(bounded.toFixed(2));
}

/// Decides whether a counterparty's offer is acceptable as-is, without an
/// LLM. Used when the LLM call fails or returns malformed JSON so a deal
/// is never stranded in an unfinalized state.
///
/// Buyer accepts when the seller's offer is at or under the buyer's
/// effective ceiling. Seller accepts when the buyer's offer is at or
/// over the seller's effective floor. Anything else declines with a
/// reason the timeline can render.
export function heuristicCounterDecision(args: {
  role: Role;
  theirOffer: number;
  floor: number;
  ceiling: number;
}): { decision: 'accept' | 'decline'; reasoning: string } {
  if (args.role === 'buyer') {
    if (args.theirOffer <= args.ceiling) {
      return {
        decision: 'accept',
        reasoning: `Seller offered ${args.theirOffer.toFixed(2)} USDC. Within the buyer's cap of ${args.ceiling.toFixed(2)} USDC. Accepting as a fallback (LLM unavailable).`,
      };
    }
    return {
      decision: 'decline',
      reasoning: `Seller offered ${args.theirOffer.toFixed(2)} USDC. Above the buyer's cap of ${args.ceiling.toFixed(2)} USDC. Declining as a fallback (LLM unavailable).`,
    };
  }
  if (args.theirOffer >= args.floor) {
    return {
      decision: 'accept',
      reasoning: `Buyer offered ${args.theirOffer.toFixed(2)} USDC. At or above the seller's floor of ${args.floor.toFixed(2)} USDC. Accepting as a fallback (LLM unavailable).`,
    };
  }
  return {
    decision: 'decline',
    reasoning: `Buyer offered ${args.theirOffer.toFixed(2)} USDC. Below the seller's floor of ${args.floor.toFixed(2)} USDC. Declining as a fallback (LLM unavailable).`,
  };
}

/// Tier-aware seller premium applied at bid time. Scales the cushion a
/// seller adds on top of its target price based on how trustworthy the
/// buyer is, instead of the old flat +15% NEW penalty. Mirrors how a
/// human seller prices known repeat clients vs cold strangers.
///
/// Returns the multiplier you apply to the base price.
///
///   elite        -> 1.00 (no premium; treat ELITE as known regular)
///   strong       -> 1.07 (thin cushion)
///   established  -> 1.15 (standard cushion)
///   cold         -> 1.20 (extra cushion for weak history)
///   new          -> 1.20 (same as cold; both flag for human review)
export function sellerPremiumByBuyerTier(buyerTier: Tier): number {
  switch (buyerTier) {
    case 'elite':
      return 1.0;
    case 'strong':
      return 1.07;
    case 'established':
      return 1.15;
    case 'cold':
    case 'new':
      return 1.2;
  }
}

/// Deterministic 0-100 bid score used to rank multiple bids on the same
/// brief. The LLM still writes per-bid reasoning, but the ranking comes
/// from this function so two scoring calls on the same bid can't disagree.
///
/// Weights: 40% price / 25% tier / 15% completion / 10% deals
///        + 5% age / 5% velocity.
///
/// Each sub-score is itself bounded to [0, 100]:
///   priceScore       100 at-or-below budget, drops linearly to 30 at the
///                    buyer's effective cap, 0 above the cap.
///   tierScore        elite 100, strong 85, established 65, cold 40, new 20
///   completionScore  completion rate * 100 (default 50 if unknown)
///   dealsScore       log10(deals+1) * 40, capped at 100
///   ageScore         log10(days+1) * 50, capped at 100
///   velocityScore    inverted-U: 2-10 deals/day rewarded, 0 or >15 punished
export interface BidScoreInputs {
  bidPriceUsdc: number;
  briefBudgetUsdc: number;
  effectiveCapUsdc: number;
  sellerTier: Tier;
  sellerCompletionRate?: number;
  sellerDealsCompleted?: number;
  sellerAccountAgeDays?: number;
  sellerVelocity24h?: number;
  /// 0..100 skill/topical fit for this brief. The single most important factor
  /// (Karwan ranks best fit first), so the deterministic fallback MUST weigh it
  /// — without it, a great-fit seller bidding a touch over budget scores low and
  /// gets buried whenever the scoring LLM fails. Neutral 50 when unknown.
  topicalMatch?: number;
}
export interface BidScore {
  score: number;
  breakdown: {
    topical: number;
    price: number;
    tier: number;
    completion: number;
    deals: number;
    age: number;
    velocity: number;
  };
}

const TIER_SCORE: Record<Tier, number> = {
  elite: 100,
  strong: 85,
  established: 65,
  cold: 40,
  new: 20,
};

export function scoreBidDeterministic(args: BidScoreInputs): BidScore {
  // priceScore: 100 at-or-below the buyer's posted budget, drops linearly
  // to 30 at the effective cap (budget * tolerance), 0 above the cap.
  const budget = Math.max(1, args.briefBudgetUsdc);
  const cap = Math.max(budget, args.effectiveCapUsdc);
  let priceScore: number;
  if (args.bidPriceUsdc <= budget) {
    priceScore = 100;
  } else if (args.bidPriceUsdc >= cap) {
    priceScore = 0;
  } else {
    // Linear from 100 (at budget) -> 30 (at cap)
    const overBudget = (args.bidPriceUsdc - budget) / (cap - budget);
    priceScore = 100 - overBudget * 70;
  }

  const tierScore = TIER_SCORE[args.sellerTier];

  const completion = args.sellerCompletionRate ?? 0.5;
  const completionScore = Math.max(0, Math.min(100, completion * 100));

  const deals = Math.max(0, args.sellerDealsCompleted ?? 0);
  const dealsScore = Math.min(100, Math.log10(deals + 1) * 40);

  const ageDays = Math.max(0, args.sellerAccountAgeDays ?? 0);
  const ageScore = Math.min(100, Math.log10(ageDays + 1) * 50);

  // Velocity: aim for a sweet spot. Below 2/day reads dormant; above 15/day
  // reads botty. Reward 2-10, taper outside.
  const vel = Math.max(0, args.sellerVelocity24h ?? 0);
  let velocityScore: number;
  if (vel < 2) velocityScore = 30 + vel * 15;
  else if (vel <= 10) velocityScore = 60 + (vel - 2) * 5;
  else if (vel <= 15) velocityScore = 100 - (vel - 10) * 10;
  else velocityScore = Math.max(10, 50 - (vel - 15) * 4);

  // Skill/topical fit. Neutral 50 when unknown so a missing value neither
  // rewards nor punishes. Carries the heaviest single weight, matching how the
  // LLM scorer (and Karwan's match-first ranking) treat fit.
  const topicalScore = Math.max(0, Math.min(100, args.topicalMatch ?? 50));

  const weighted =
    topicalScore * 0.3 +
    priceScore * 0.3 +
    tierScore * 0.2 +
    completionScore * 0.1 +
    dealsScore * 0.05 +
    ageScore * 0.025 +
    velocityScore * 0.025;

  return {
    score: Math.round(weighted),
    breakdown: {
      topical: Math.round(topicalScore),
      price: Math.round(priceScore),
      tier: Math.round(tierScore),
      completion: Math.round(completionScore),
      deals: Math.round(dealsScore),
      age: Math.round(ageScore),
      velocity: Math.round(velocityScore),
    },
  };
}

/// Final-round acceptance hook. At the buyer's last allowed counter round,
/// any seller offer inside the effective cap should be accepted rather
/// than declined "max-counter-rounds." Humans close at the boundary;
/// agents that decline because they ran out of rounds feel like bots.
///
/// Returns true when the agent should accept the standing offer instead
/// of letting the round-cap path fire `agent.declined`.
export function shouldAcceptOnFinalRound(args: {
  role: Role;
  currentRound: number;
  maxRounds: number;
  theirOffer: number;
  myCeiling: number;
  myFloor: number;
}): boolean {
  const isLastRound = args.currentRound >= args.maxRounds - 1;
  if (!isLastRound) return false;
  if (args.role === 'buyer') {
    return args.theirOffer <= args.myCeiling;
  }
  return args.theirOffer >= args.myFloor;
}

/// Suggests an opening anchor for a new bid. Sellers anchor at the higher
/// end of their acceptable band; buyers reveal slightly below their cap.
/// This signals room to move without giving away the reservation price.
export function openingAnchor(args: {
  role: Role;
  target: number;
  floor: number;
  ceiling: number;
  tier: Tier;
}): number {
  // Sellers open at +12% over target (capped at ceiling), buyers open at
  // -8% under cap (floored at target). Elasticity dials the gap for
  // trusted counterparties. An ELITE buyer sees the seller anchor closer
  // to target, signalling "I trust you, less haggling needed."
  const elasticity = TIER_ELASTICITY[args.tier];
  if (args.role === 'seller') {
    const baseAnchor = args.target * (1 + 0.12 / elasticity);
    return Number(Math.min(args.ceiling, Math.max(args.target, baseAnchor)).toFixed(2));
  }
  const baseAnchor = args.target * (1 - 0.08 / elasticity);
  return Number(Math.max(args.floor, Math.min(args.target, baseAnchor)).toFixed(2));
}
