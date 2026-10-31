import type { Listing } from '../db/listings.js';

/// An order on a listing is the listing as it stands (view 44, D10). The order
/// page, the assistant and POST /api/deals/direct all build it here, so the
/// seller's agent can accept one at once without reading anything twice.

export interface ListingOrderTerms {
  dealAmountUsdc: number;
  deadlineDays: number;
  terms: string;
  firstReleasePct: number;
  milestonePcts: number[];
  reviewWindowDays?: number;
}

export function listingOrderTerms(listing: Listing): ListingOrderTerms {
  const pcts = listing.termsDraft?.parts.map((part) => part.pct).filter((pct) => pct > 0) ?? [];
  const milestonePcts = pcts.length && pcts.reduce((sum, pct) => sum + pct, 0) === 100 ? pcts : [100];
  const terms = listing.terms?.trim() || `${listing.title.trim()}\n\n${listing.description.trim()}`.trim();
  return {
    dealAmountUsdc: listing.askingPriceUsdc,
    deadlineDays: Math.max(1, listing.readyInDays ?? 1),
    terms: terms.slice(0, 4000),
    firstReleasePct: milestonePcts[0] ?? 100,
    milestonePcts,
    ...(listing.termsDraft?.reviewWindowDays ? { reviewWindowDays: listing.termsDraft.reviewWindowDays } : {}),
  };
}

export type ListingOrderCheck = { ok: true } | { ok: false; reason: 'closed' | 'changed' | 'own' };

/// Closed when the listing was cancelled or ran out; changed when anything in
/// the order differs from the listing now. The route adds 'own' with the caller.
export function listingOrderMatches(
  order: { sellerAddress?: string; dealAmountUsdc: number; deadlineDays: number; terms: string; milestonePcts?: number[]; firstReleasePct: number },
  listing: Listing,
  now: number,
): ListingOrderCheck {
  if (listing.cancelledAt || now > listing.expiresAt) return { ok: false, reason: 'closed' };
  const want = listingOrderTerms(listing);
  const same =
    order.sellerAddress?.toLowerCase() === listing.sellerUser.toLowerCase() &&
    order.dealAmountUsdc === want.dealAmountUsdc &&
    order.deadlineDays === want.deadlineDays &&
    order.terms.trim() === want.terms &&
    order.firstReleasePct === want.firstReleasePct &&
    (order.milestonePcts ?? [order.firstReleasePct]).join(',') === want.milestonePcts.join(',');
  return same ? { ok: true } : { ok: false, reason: 'changed' };
}

/// The seller's agent accepts for them only inside their limits: the order is
/// the listing exactly, it is not a trade-finance deal, no World ID check is due
/// for the seller, and the agent is the one linked to them.
export function agentMayAccept(input: { matches: boolean; tradeLane?: string; sellerCheckDue: boolean; sellerAgentLinked: boolean }): boolean {
  return input.matches && input.tradeLane !== 'finance' && !input.sellerCheckDue && input.sellerAgentLinked;
}
