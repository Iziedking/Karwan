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
  // trusted counterparties — an ELITE buyer sees the seller anchor closer
  // to target, signalling "I trust you, less haggling needed."
  const elasticity = TIER_ELASTICITY[args.tier];
  if (args.role === 'seller') {
    const baseAnchor = args.target * (1 + 0.12 / elasticity);
    return Number(Math.min(args.ceiling, Math.max(args.target, baseAnchor)).toFixed(2));
  }
  const baseAnchor = args.target * (1 - 0.08 / elasticity);
  return Number(Math.max(args.floor, Math.min(args.target, baseAnchor)).toFixed(2));
}
