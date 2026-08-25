import type { JobContext } from '../llm/prompts.js';
import type { SellerProfile } from './seller-profile.js';
import type { Tier } from './strategy.js';

/** Randomness is supplied by the caller so pricing can be characterized safely. */
export type RandomSource = () => number;

const HEADROOM_BASE_PCT = 5;
const HEADROOM_DEMAND_SPAN_PCT = 45;

/**
 * Pure opening-bid calculation used by the legacy seller path.
 *
 * The formula and bounds intentionally match the historical implementation;
 * only the random source is injected so fixtures can reproduce a decision.
 */
export function sellerOpeningBid(
  seller: SellerProfile,
  job: JobContext,
  buyerTier: Tier,
  heat: number,
  marketPriceUsdc: number | undefined,
  random: RandomSource,
): number | null {
  const budget = Number(job.budgetUsdc);
  const tol = job.negotiationMaxIncreasePct ?? 0;
  const h = Number.isFinite(heat) ? Math.max(0, Math.min(1, heat)) : 0.5;
  const market = marketPriceUsdc && marketPriceUsdc > 0 ? Math.min(marketPriceUsdc, budget * 2) : 0;
  const demandHeadroomPct = HEADROOM_BASE_PCT + h * HEADROOM_DEMAND_SPAN_PCT;
  const openHeadroomPct = Math.max(tol, demandHeadroomPct);
  const openCeiling = budget * (1 + openHeadroomPct / 100);
  const floor = Math.max(seller.minBudgetUsdc, budget, market);
  const ceiling = Math.min(seller.maxBudgetUsdc, Math.max(openCeiling, market));
  if (!Number.isFinite(ceiling) || ceiling < floor) return null;
  if (ceiling === floor) return Number(floor.toFixed(2));

  const tierBias: Record<Tier, number> = {
    elite: 0.15,
    strong: 0.35,
    established: 0.5,
    cold: 0.7,
    new: 0.8,
  };
  const jitter = Math.max(0, Math.min(1, random()));
  let fraction = Math.max(
    0,
    Math.min(1, 0.15 * addressFraction(seller.address) + 0.3 * tierBias[buyerTier] + 0.4 * h + 0.15 * jitter),
  );
  if (job.trustedMatch) fraction = Math.min(fraction * 0.7, 0.55);
  return Number((floor + (ceiling - floor) * fraction).toFixed(2));
}

/** Pure UTC day calculation for counter timing. */
export function sellerDaysToDeadline(deadlineUnix: number, nowUnix: number): number {
  return Math.max(1, Math.floor((deadlineUnix - nowUnix) / 86_400));
}

/** Stable address -> [0, 1) fraction used to spread seller openings. */
export function addressFraction(address: string): number {
  let hash = 0;
  const normalized = address.toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}
