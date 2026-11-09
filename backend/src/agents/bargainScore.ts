import type { PublicRating } from '../ratings/rules.js';

/// One blended score for the shortlist (view 73, decision 4; spec S12): skill
/// fit, the agreed price against the budget, ratings and reputation weighed
/// together. Fit keeps the largest weight, cheaper scores higher within the
/// budget, and an offer under a minimum fit or past the buyer's leeway is not
/// listed. Pure; the weights live here so they can be tuned in one place.

export interface ScoreInput {
  /// 0 to 100, how much of the request the seller's skills cover; null when unknown.
  topicalMatch: number | null;
  /// 0 to 4 from `location/rules.ts` locationFit; read only for in-person work.
  locationFit: number | null;
  inPerson: boolean;
  priceUsdc: number;
  budgetUsdc: number;
  leewayPct: number;
  rating: PublicRating;
  verified: boolean;
  completed: number;
  disputesLost: number;
  pastDealsTogether: number;
}

export interface ScoreParts {
  fit: number;
  price: number;
  ratings: number;
  reputation: number;
}

export type ScoreWhy = 'best_fit' | 'fair_price' | 'well_rated' | 'trusted';

export const MIN_FIT = 40;

const WEIGHTS: ScoreParts = { fit: 35, price: 30, ratings: 15, reputation: 20 };
const WHY: Record<keyof ScoreParts, ScoreWhy> = { fit: 'best_fit', price: 'fair_price', ratings: 'well_rated', reputation: 'trusted' };
const NEUTRAL_PRICE = 60;
const LEEWAY_FLOOR = 30;

const clamp = (n: number, lo = 0, hi = 100) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo);
const round1 = (n: number) => Math.round(n * 10) / 10;

function fitPart(i: ScoreInput): number {
  const topical = i.topicalMatch === null ? 50 : clamp(i.topicalMatch);
  if (!i.inPerson || i.locationFit === null) return topical;
  return 0.7 * topical + 0.3 * clamp((i.locationFit / 4) * 100);
}

/// null: past the leeway, not listed.
function pricePart(i: ScoreInput): number | null {
  if (!(i.budgetUsdc > 0)) return NEUTRAL_PRICE;
  if (i.priceUsdc <= i.budgetUsdc) return NEUTRAL_PRICE + 40 * (1 - clamp(i.priceUsdc / i.budgetUsdc, 0, 1));
  const cap = i.budgetUsdc * (1 + Math.max(0, i.leewayPct) / 100);
  if (i.priceUsdc > cap) return null;
  const over = (i.priceUsdc - i.budgetUsdc) / (cap - i.budgetUsdc);
  return NEUTRAL_PRICE - (NEUTRAL_PRICE - LEEWAY_FLOOR) * over;
}

function ratingsPart(r: PublicRating): number {
  return r.kind === 'rated' ? clamp((r.value / 5) * 100) : 50;
}

function reputationPart(i: ScoreInput): number {
  const completed = Math.min(100, Math.log10(Math.max(0, i.completed) + 1) * 40);
  return (i.verified ? 40 : 0) + completed * 0.3 + (i.disputesLost > 0 ? 0 : 20) + (Math.min(3, Math.max(0, i.pastDealsTogether)) / 3) * 10;
}

export function blendedScore(i: ScoreInput): { score: number; parts: ScoreParts; why: ScoreWhy[]; listed: boolean } {
  const fit = fitPart(i);
  const price = pricePart(i);
  const parts: ScoreParts = {
    fit: round1(fit),
    price: round1(price ?? LEEWAY_FLOOR),
    ratings: round1(ratingsPart(i.rating)),
    reputation: round1(reputationPart(i)),
  };
  const keys = Object.keys(WEIGHTS) as (keyof ScoreParts)[];
  const weighted = keys.map((k) => ({ k, v: (parts[k] * WEIGHTS[k]) / 100 }));
  const score = round1(weighted.reduce((sum, w) => sum + w.v, 0));
  const why = [...weighted].sort((a, b) => b.v - a.v).slice(0, 2).map((w) => WHY[w.k]);
  // The minimum is on the skills alone: distance lowers the score, never
  // drops a seller who can do the work. An unknown fit is not a miss.
  const fitsEnough = i.topicalMatch === null || i.topicalMatch >= MIN_FIT;
  return { score, parts, why, listed: price !== null && fitsEnough };
}
