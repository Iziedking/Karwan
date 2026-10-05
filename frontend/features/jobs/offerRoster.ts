import type { BuyerBid } from '@/core/api';

export type FitLevel = 'strong' | 'good' | 'partial';

/// Same band size as the buyer agent's ranking (backend agents/buyer.ts), so the
/// order on screen is the order the agent picks in.
const MATCH_BAND_SIZE = 25;
export const OFFERS_PER_PAGE = 4;

export function fitLevel(topicalMatch: number | null): FitLevel | null {
  if (topicalMatch == null) return null;
  if (topicalMatch >= 75) return 'strong';
  if (topicalMatch >= 50) return 'good';
  return 'partial';
}

export function rankOffers(bids: readonly BuyerBid[]): BuyerBid[] {
  const band = (b: BuyerBid) => (b.topicalMatch != null ? Math.floor(b.topicalMatch / MATCH_BAND_SIZE) : -1);
  return [...bids].sort((a, b) => {
    const byBand = band(b) - band(a);
    if (byBand !== 0) return byBand;
    const byScore = (b.score ?? 0) - (a.score ?? 0);
    if (byScore !== 0) return byScore;
    return Number(a.priceUsdc) - Number(b.priceUsdc);
  });
}

/// Pages accumulate: page 2 shows the first eight, so nothing jumps away.
export function offersPage<T>(ranked: readonly T[], page: number): T[] {
  return ranked.slice(0, Math.max(1, page) * OFFERS_PER_PAGE);
}

export function priceRange(bids: readonly BuyerBid[]): { min: number; max: number } | null {
  if (bids.length === 0) return null;
  const prices = bids.map((b) => Number(b.priceUsdc));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
