import type { Listing } from '../db/listings.js';
import { topicalMatchScore, topicalOverlap } from '../llm/keywords.js';
import { prohibitedReason } from '../policy/prohibited.js';
import { isPublic } from '../market/visibility.js';

export type FitOffer = Pick<Listing, 'id' | 'title' | 'description' | 'askingPriceUsdc' | 'sellerUser' | 'expiresAt'> &
  Partial<Pick<Listing, 'cancelledAt' | 'visibility' | 'seedKey' | 'terms'>>;

export type FitRequest = { brief: string; budgetUsdc: number; buyer?: string | null; now: number };

export type OffersThatFit = { count: number; offers: Array<{ id: string; title: string; askingPriceUsdc: number }> };

/// Most offers named on a request before it posts (view 56).
export const FIT_NAMED = 3;
/// Share of an offer's title words the request has to say for it to fit.
const TITLE_COVERED = 50;

/// The offers already on the market that fit a request being prepared (view 56,
/// "Requests check the market first"): open, public, real, not the person's own,
/// asking no more than the budget, and with most of the offer's title said in
/// the request. Best first: more shared words, then closer cover, then cheaper.
export function offersThatFit(request: FitRequest, offers: readonly FitOffer[]): OffersThatFit {
  const buyer = request.buyer?.toLowerCase() ?? null;
  const fits = offers
    .filter((o) => !o.cancelledAt && o.expiresAt > request.now && isPublic(o) && !o.seedKey)
    .filter((o) => o.sellerUser.toLowerCase() !== buyer)
    .filter((o) => o.askingPriceUsdc > 0 && o.askingPriceUsdc <= request.budgetUsdc)
    .filter((o) => !prohibitedReason(o.title, o.description, o.terms))
    .map((o) => ({
      o,
      shared: topicalOverlap([o.title], [request.brief]),
      cover: topicalMatchScore([o.title], [request.brief]),
    }))
    .filter((f) => f.shared > 0 && f.cover >= TITLE_COVERED)
    .sort((a, b) => b.shared - a.shared || b.cover - a.cover || a.o.askingPriceUsdc - b.o.askingPriceUsdc || a.o.id.localeCompare(b.o.id));
  return {
    count: fits.length,
    offers: fits.slice(0, FIT_NAMED).map(({ o }) => ({ id: o.id, title: o.title, askingPriceUsdc: o.askingPriceUsdc })),
  };
}
