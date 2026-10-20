import type { RepTier } from '../agents/signals.js';

/// How a seller's financing offers are ordered (owner, 20 Oct 2026): offers the
/// financier can pay now first, then the financier's reputation tier, then the
/// bigger advance, then the smaller repayment, then whoever offered first. The
/// top payable offer is Recommended.

export interface RankInput {
  id: string;
  offeredAdvanceUsdc: string;
  expectedReturnUsdc: string;
  offeredAt: number;
  tier: RepTier;
  /// The financier's wallet holds the advance right now.
  funded: boolean;
}

const TIER_RANK: Record<RepTier, number> = { elite: 4, strong: 3, established: 2, cold: 1, new: 0 };

export function rankFinancingOffers<T extends RankInput>(offers: readonly T[]): Array<T & { recommended: boolean }> {
  const sorted = [...offers].sort(
    (a, b) =>
      Number(b.funded) - Number(a.funded) ||
      TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
      Number(b.offeredAdvanceUsdc) - Number(a.offeredAdvanceUsdc) ||
      Number(a.expectedReturnUsdc) - Number(b.expectedReturnUsdc) ||
      a.offeredAt - b.offeredAt,
  );
  return sorted.map((o, i) => ({ ...o, recommended: i === 0 && o.funded }));
}
