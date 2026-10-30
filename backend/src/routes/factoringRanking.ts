import type { RepTier } from '../agents/signals.js';
import { config } from '../config.js';

/// How a seller's financing offers are ordered (owner, 20 Oct 2026): offers the
/// financier can pay now first, then the financier's reputation tier, then the
/// bigger advance, then the smaller repayment, then whoever offered first. The
/// top payable offer is Recommended. Karwan's test financier competes on the
/// same rules and loses a tie to a partner (owner, 30 Oct 2026).

export interface RankInput {
  id: string;
  offeredAdvanceUsdc: string;
  expectedReturnUsdc: string;
  offeredAt: number;
  tier: RepTier;
  /// The financier's wallet holds the advance right now.
  funded: boolean;
  financier?: string;
}

const TIER_RANK: Record<RepTier, number> = { elite: 4, strong: 3, established: 2, cold: 1, new: 0 };

export function rankFinancingOffers<T extends RankInput>(
  offers: readonly T[],
  testFinancier: string | undefined = config.KARWAN_TEST_FINANCIER_ADDR,
): Array<T & { recommended: boolean }> {
  const house = (o: T) => Number(!!testFinancier && o.financier?.toLowerCase() === testFinancier.toLowerCase());
  const sorted = [...offers].sort(
    (a, b) =>
      Number(b.funded) - Number(a.funded) ||
      TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
      Number(b.offeredAdvanceUsdc) - Number(a.offeredAdvanceUsdc) ||
      Number(a.expectedReturnUsdc) - Number(b.expectedReturnUsdc) ||
      house(a) - house(b) ||
      a.offeredAt - b.offeredAt,
  );
  return sorted.map((o, i) => ({ ...o, recommended: i === 0 && o.funded }));
}
