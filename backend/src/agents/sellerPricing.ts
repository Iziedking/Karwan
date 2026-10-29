import type { JobContext } from '../llm/prompts.js';
import type { SellerProfile } from './seller-profile.js';
import type { Tier } from './strategy.js';

/** Randomness is supplied by the caller so pricing can be characterized safely. */
export type RandomSource = () => number;

const HEADROOM_BASE_PCT = 5;
const HEADROOM_DEMAND_SPAN_PCT = 45;
/// How far under the budget a seller may open when demand for the skill is low.
const UNDERCUT_SPAN_PCT = 20;

/**
 * Pure opening-bid calculation used by the legacy seller path.
 *
 * The opening anchors on the seller's usual price (view 41): demand moves it
 * from up to 20% under the usual for a common skill to up to 50% over it for a
 * scarce one, never under the seller's own lowest or a grounded market price,
 * and with no seller maximum. It may sit under the buyer's budget (view 35) or
 * over it; the buyer's leeway is their private limit and plays no part. An
 * account that never set a usual price anchors on the budget, as before. The
 * random source is injected so fixtures can reproduce a decision.
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
  const h = Number.isFinite(heat) ? Math.max(0, Math.min(1, heat)) : 0.5;
  const market = marketPriceUsdc && marketPriceUsdc > 0 ? Math.min(marketPriceUsdc, budget * 2) : 0;
  const usual = seller.usualPriceUsdc && seller.usualPriceUsdc > 0 ? seller.usualPriceUsdc : budget;
  const demandHeadroomPct = HEADROOM_BASE_PCT + h * HEADROOM_DEMAND_SPAN_PCT;
  const lowest = Math.max(seller.minBudgetUsdc, market);
  const floor = Math.max(lowest, usual * (1 - ((1 - h) * UNDERCUT_SPAN_PCT) / 100));
  const ceiling = Math.max(floor, usual * (1 + demandHeadroomPct / 100), market);
  if (!Number.isFinite(ceiling) || !Number.isFinite(floor)) return null;
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

/// Offers only move down, and at most this many times per seller per request.
export const MAX_OFFER_REVISIONS = 3;
/// A seller whose floor is past this many times the budget cannot fit at any
/// reasonable stretch, so it withdraws rather than sit on the list.
const WITHDRAW_PAST_BUDGET_X = 3;

export type SellerRevision = { action: 'keep' } | { action: 'lower'; priceUsdc: number } | { action: 'withdraw' };

/**
 * How a seller's agent answers a change (view 35): the buyer changed the
 * request, or a best and final round says a lower offer is in. The target is
 * the budget, or the lowest other offer on best and final; the step toward it
 * is a share of the gap drawn from `random`, so sellers move differently and
 * nothing looks scripted. Never above the standing offer, never under the
 * seller's own floor, never more than MAX_OFFER_REVISIONS times.
 */
export function sellerRevision(input: {
  standingUsdc: number;
  floorUsdc: number;
  reason: 'request-changed' | 'best-and-final';
  budgetUsdc: number;
  lowestOtherUsdc?: number;
  revisionsSoFar: number;
  random: RandomSource;
}): SellerRevision {
  const { standingUsdc, floorUsdc, budgetUsdc } = input;
  if (input.revisionsSoFar >= MAX_OFFER_REVISIONS) return { action: 'keep' };
  if (floorUsdc > budgetUsdc * WITHDRAW_PAST_BUDGET_X) return { action: 'withdraw' };
  const aim = input.reason === 'best-and-final' && input.lowestOtherUsdc !== undefined && input.lowestOtherUsdc < standingUsdc
    ? input.lowestOtherUsdc
    : budgetUsdc;
  const target = Math.max(aim, floorUsdc);
  if (standingUsdc <= target) return { action: 'keep' };
  const share = 0.3 + 0.4 * Math.max(0, Math.min(1, input.random()));
  const price = Math.max(floorUsdc, Number((standingUsdc - (standingUsdc - target) * share).toFixed(2)));
  return price < standingUsdc ? { action: 'lower', priceUsdc: price } : { action: 'keep' };
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
