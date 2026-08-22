/// What it would actually take to reach the next tier.
///
/// Three surfaces answered this and all three answered it wrong, each in its own
/// way, because each re-derived it from the score:
///
///   the credit passport   `TIER_BANDS.find(b => b.start > score)` finds the next
///                         SCORE band, not the next tier above the one held. A
///                         wallet on 711 capped at ESTABLISHED was told "next:
///                         Elite +89", skipping STRONG and naming a tier that
///                         more points cannot buy.
///   the profile card      `max(0, BREAKS[idx + 1] - score)` on a capped wallet
///                         is negative, so it clamped to 0 and read "0 to
///                         ESTABLISHED" for someone who is not there.
///   the stake page        handled the deals ceiling and then fell through to
///                         the same points maths for the concentration one.
///
/// The score is not the only gate. The backend already resolves which gate binds
/// (`tierCappedBy`, `dealsToNextTier`) and returns it, so this reads that answer
/// instead of guessing at it. Points are only the answer when points are what is
/// missing.
export type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';

export const TIER_ORDER: Tier[] = ['NEW', 'COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];

/// Must stay in lockstep with TIER_BREAKPOINTS in
/// backend/src/reputation/config.ts. The backend pins these with a test; this
/// side is pinned by tierProgress.test.ts.
export const TIER_START: Record<Tier, number> = {
  NEW: 0,
  COLD: 200,
  ESTABLISHED: 400,
  STRONG: 600,
  ELITE: 800,
};

export type TierProgress =
  /// Nothing above this. No hint to show.
  | { kind: 'top' }
  /// Score is the only thing missing.
  | { kind: 'points'; nextTier: Tier; points: number }
  /// Held down by completed deals. More points will not move it.
  | { kind: 'deals'; nextTier: Tier; deals: number }
  /// Held down by counterparty concentration. Neither points nor more deals
  /// with the same counterparty will move it.
  | { kind: 'concentration'; nextTier: Tier }
  /// The score and the tier disagree and nothing explains why: an older API
  /// without the ceiling fields, or a stale read. Say nothing rather than
  /// inventing a number.
  | { kind: 'unknown' };

export function tierProgress(input: {
  score: number;
  /// The tier actually held, after ceilings.
  tier: Tier;
  tierCappedBy?: 'deals' | 'concentration' | null;
  dealsToNextTier?: number | null;
}): TierProgress {
  const { tier, tierCappedBy } = input;
  const score = Number.isFinite(input.score) ? Math.round(input.score) : 0;

  const index = TIER_ORDER.indexOf(tier);
  if (index < 0) return { kind: 'unknown' };
  // The next rung above the tier HELD, never the next score band. This is the
  // line that stopped a capped wallet being pointed at ELITE.
  const nextTier = TIER_ORDER[index + 1];
  if (!nextTier) return { kind: 'top' };

  if (tierCappedBy === 'concentration') return { kind: 'concentration', nextTier };
  if (tierCappedBy === 'deals') {
    const deals = input.dealsToNextTier;
    // Capped by deals but no count: the backend could not say how many, so
    // neither can this.
    if (typeof deals !== 'number' || deals <= 0) return { kind: 'unknown' };
    return { kind: 'deals', nextTier, deals };
  }

  const points = TIER_START[nextTier] - score;
  // Nothing is capping the wallet and yet its score already clears the next
  // rung. That is not a state to render a number for; it means this read is
  // inconsistent with the one that produced the tier.
  if (points <= 0) return { kind: 'unknown' };
  return { kind: 'points', nextTier, points };
}
