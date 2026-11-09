import type { BudgetRange } from './budgetRange.js';
import { jitterFor } from './concession.js';

/// A seller's opening price (view 73, decisions 1, 2, 3 and 5; spec S1, S4).
/// Under the target an offer bargains up from its posted price toward it; a
/// Fixed price over the target stays put and cannot be countered; a From price
/// over it opens at its lowest. No opening sits under half the market price.

export type PriceKind = 'fixed' | 'from';

/// Fixed when the lowest equals the asking price, until view 47's price kinds ship (S1).
export function priceKindOf(listing: { askingPriceUsdc: number; floorUsdc: number }): PriceKind {
  return listing.floorUsdc === listing.askingPriceUsdc ? 'fixed' : 'from';
}

/// The referee clamp min(B, range top): the only seller-pricing use of the budget (S3).
export function refereeTarget(budgetUsdc: number, range: BudgetRange | null): number {
  return range ? Math.min(budgetUsdc, range.highUsdc) : budgetUsdc;
}

export interface OpeningInput {
  kind: PriceKind;
  postedUsdc: number;
  lowestUsdc: number;
  refereeTargetUsdc: number;
  marketUsdc: number | null;
  /// Each 0 to 1: skill fit, the seller's record, demand for the skill.
  fit: number;
  record: number;
  heat: number;
  seed: string;
}

export interface Opening {
  priceUsdc: number;
  outside: boolean;
  counterable: boolean;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const money = (n: number) => Number(n.toFixed(2));

export function sellerOpening(i: OpeningInput): Opening {
  const posted = i.postedUsdc;
  const target = i.refereeTargetUsdc;
  const halfMarket = i.marketUsdc !== null && i.marketUsdc > 0 ? i.marketUsdc * 0.5 : 0;
  const lowest = Math.min(Math.max(0, i.lowestUsdc), posted);

  // No budget: the posted price stands, lifted to half the market.
  if (!(target > 0)) return { priceUsdc: money(Math.max(posted, halfMarket)), outside: false, counterable: true };

  if (posted <= target) {
    const share = 0.35 + 0.5 * clamp01(0.4 * clamp01(i.fit) + 0.3 * clamp01(i.record) + 0.3 * clamp01(i.heat)) + jitterFor(i.seed);
    const toward = posted + (target - posted) * share;
    const opening = Math.min(target, Math.max(posted, toward, halfMarket));
    return { priceUsdc: money(opening), outside: false, counterable: true };
  }

  if (i.kind === 'fixed') return { priceUsdc: money(posted), outside: true, counterable: false };

  if (lowest > target) return { priceUsdc: money(Math.max(lowest, halfMarket)), outside: true, counterable: true };
  return { priceUsdc: money(Math.min(target, Math.max(lowest, halfMarket))), outside: false, counterable: true };
}
