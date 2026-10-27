/// What the buyer's agent does with an offer from a seller it may already hold
/// (view 35). The JobBoard keeps one offer per seller and a second submitBid
/// replaces the first, so a repeat offer is a revision. Offers only move down:
/// a higher repeat is ignored, and a seller who withdrew is never taken back.

import { parseUnits } from 'viem';

export interface StandingOffer {
  priceUsdc: string;
  deadlineUnix: number;
}

export type OfferRevisionStep = 'new' | 'lower-now' | 'lower-after-counter' | 'ignore';

/// After the buyer edits a request: look again at the offers held and counter
/// a changed recommendation ('rejudge'), only rank them again while a counter
/// is already waiting ('rank-only'), or leave a request past that alone.
export function rejudgeStep(s: {
  finalized: boolean;
  escrowFunded: boolean;
  expired: boolean;
  nearMissPending: boolean;
  counterInFlight: boolean;
  offers: number;
}): 'rejudge' | 'rank-only' | 'skip' {
  if (s.finalized || s.escrowFunded || s.expired || s.nearMissPending || s.offers === 0) return 'skip';
  return s.counterInFlight ? 'rank-only' : 'rejudge';
}

type PricedOffer = { seller: string; priceUsdc: string };

/// The best and final round goes to every seller whose offer is not the
/// lowest. It carries no prices: a seller only learns a lower offer is in.
export function bestAndFinalRecipients(offers: readonly PricedOffer[]): string[] {
  if (offers.length < 2) return [];
  const lowest = Math.min(...offers.map((o) => Number(o.priceUsdc)));
  return offers.filter((o) => Number(o.priceUsdc) > lowest).map((o) => o.seller);
}

/// The lowest offer other than this seller's, for that seller's own decision.
export function lowestOtherUsdc(offers: readonly PricedOffer[], seller: string): number | null {
  const others = offers.filter((o) => o.seller.toLowerCase() !== seller.toLowerCase()).map((o) => Number(o.priceUsdc));
  return others.length ? Math.min(...others) : null;
}

export function decideOfferRevision(input: {
  seller: string;
  next: StandingOffer;
  standing?: StandingOffer;
  /// The seller a counter is waiting on, if any.
  counterOpenWith?: string;
  withdrawn?: boolean;
}): OfferRevisionStep {
  if (input.withdrawn) return 'ignore';
  if (!input.standing) return 'new';
  if (parseUnits(input.next.priceUsdc, 6) >= parseUnits(input.standing.priceUsdc, 6)) return 'ignore';
  // A counter in flight keeps its price; the lower offer lands once it ends.
  if (input.counterOpenWith && input.counterOpenWith.toLowerCase() === input.seller.toLowerCase()) return 'lower-after-counter';
  return 'lower-now';
}
