import { budgetRange } from './budgetRange.js';
import { priceKindOf, refereeTarget, sellerOpening } from './opening.js';

/// Where a seller's agent opens on a request (view 73, decisions 1, 2, 3, 5;
/// spec S4). With bargaining off it keeps today's rule: the posted price, or
/// the lowest when the lowest is over the buyer's ceiling.

export interface OpeningSignals {
  marketUsdc: number | null;
  /// Each 0 to 1: skill fit, the seller's record, demand for the skill.
  fit: number;
  record: number;
  heat: number;
  seed: string;
}

export interface ListingBidTerms {
  askingPriceUsdc: number;
  floorUsdc: number;
  outsideRequest: boolean;
  counterable: boolean;
  openedUsdc: number;
}

export function listingBidTerms(
  listing: { askingPriceUsdc: number; floorUsdc: number },
  request: { budgetUsdc: number; leewayPct: number; bargain: boolean },
  signals: OpeningSignals,
): ListingBidTerms {
  const ceiling = request.budgetUsdc * (1 + Math.max(0, request.leewayPct) / 100);
  if (!request.bargain) {
    const outside = listing.floorUsdc > ceiling;
    const asking = outside ? listing.floorUsdc : listing.askingPriceUsdc;
    return { askingPriceUsdc: asking, floorUsdc: listing.floorUsdc, outsideRequest: outside, counterable: true, openedUsdc: asking };
  }
  const target = refereeTarget(request.budgetUsdc, budgetRange(request.budgetUsdc));
  const opening = sellerOpening({
    kind: priceKindOf(listing),
    postedUsdc: listing.askingPriceUsdc,
    lowestUsdc: listing.floorUsdc,
    refereeTargetUsdc: target,
    ...signals,
  });
  // Under the budget the posted price is the seller's lowest: the agent
  // bargains up from it, never under it.
  const floor = target > 0 && listing.askingPriceUsdc <= target ? listing.askingPriceUsdc : listing.floorUsdc;
  return {
    askingPriceUsdc: opening.priceUsdc,
    floorUsdc: floor,
    outsideRequest: request.budgetUsdc > 0 && opening.priceUsdc > ceiling,
    counterable: opening.counterable,
    openedUsdc: opening.priceUsdc,
  };
}

/// A profile bid with a usual price: the usual price stands in for the posted
/// one and the seller's minimum for the lowest. Null leaves today's opening.
export function profileOpening(
  seller: { usualUsdc: number | null; lowestUsdc: number },
  budgetUsdc: number,
  signals: OpeningSignals,
): number | null {
  if (!(seller.usualUsdc !== null && seller.usualUsdc > 0) || !(budgetUsdc > 0)) return null;
  return sellerOpening({
    kind: 'from',
    postedUsdc: seller.usualUsdc,
    lowestUsdc: Math.min(seller.lowestUsdc, seller.usualUsdc),
    refereeTargetUsdc: refereeTarget(budgetUsdc, budgetRange(budgetUsdc)),
    ...signals,
  }).priceUsdc;
}
