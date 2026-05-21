// Seller listings — standing offers a seller has published off-chain. Matched
// against open buyer briefs (in-memory JobStates) when a listing is created or
// when a brief is posted. Off-chain; the on-chain action when a match fires is
// the seller's existing submitBid call.

import { randomBytes } from 'node:crypto';

export interface Listing {
  id: string;
  sellerUser: string;
  sellerAgent: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  /** Floor = askingPriceUsdc * (1 - pct/100). 0 = strict at askingPriceUsdc. */
  negotiationMaxDecreasePct?: number;
  postedAt: number;
  /// When the listing's window for matching closes. Past this point the
  /// listing is treated as expired by all match scanners and surfaces. We
  /// default to 30 days at create time when the caller doesn't override.
  expiresAt: number;
  /** Set when this listing has triggered a matched bid; prevents re-firing. */
  matchedAt?: number;
  matchedJobId?: string;
  /// Set when the seller cancels their own listing. Terminal — once set, the
  /// listing drops out of every scanner and marketplace filter.
  cancelledAt?: number;
}

const store = new Map<string, Listing>();

const DEFAULT_TTL_DAYS = 30;

export function getListing(id: string): Listing | null {
  return store.get(id) ?? null;
}

export function createListing(
  input: Omit<
    Listing,
    'id' | 'postedAt' | 'matchedAt' | 'matchedJobId' | 'cancelledAt' | 'expiresAt'
  > & { ttlDays?: number },
): Listing {
  const id = `lst_${randomBytes(8).toString('hex')}`;
  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  const now = Date.now();
  const listing: Listing = {
    id,
    sellerUser: input.sellerUser.toLowerCase(),
    sellerAgent: input.sellerAgent.toLowerCase(),
    title: input.title,
    description: input.description,
    askingPriceUsdc: input.askingPriceUsdc,
    negotiationMaxDecreasePct: input.negotiationMaxDecreasePct,
    postedAt: now,
    expiresAt: now + ttlDays * 24 * 60 * 60 * 1000,
  };
  store.set(id, listing);
  return listing;
}

/// Open = not cancelled, not past expiry. A listing stays live until it expires
/// or the seller cancels it, even after it has matched briefs: one offer can be
/// caught by several buyer agents and negotiated in parallel, and the seller
/// accepts each match they can deliver on. matchedAt is a "last matched" marker,
/// not a close signal. Used by every match scanner and the marketplace browse.
export function listOpenListings(): Listing[] {
  const now = Date.now();
  return [...store.values()].filter(
    (l) => !l.cancelledAt && l.expiresAt > now,
  );
}

export function listListingsForSeller(sellerUserAddress: string): Listing[] {
  const a = sellerUserAddress.toLowerCase();
  return [...store.values()]
    .filter((l) => l.sellerUser === a)
    .sort((x, y) => y.postedAt - x.postedAt);
}

export function listAllListings(): Listing[] {
  return [...store.values()].sort((x, y) => y.postedAt - x.postedAt);
}

/// Removes every listing owned by `addressLower`. Used by the admin
/// reset-history endpoint to drop test-pollution from a single wallet
/// without wiping every other seller's data. Listings are in-memory only
/// so no persist call is needed.
export function deleteListingsBySeller(addressLower: string): number {
  const target = addressLower.toLowerCase();
  let removed = 0;
  for (const [k, v] of store.entries()) {
    if (v.sellerUser === target) {
      store.delete(k);
      removed += 1;
    }
  }
  return removed;
}

export function markListingMatched(id: string, jobId: string): void {
  const l = store.get(id);
  if (!l) return;
  l.matchedAt = Date.now();
  l.matchedJobId = jobId;
  store.set(id, l);
}

/// Seller-initiated cancel. Caller checks ownership BEFORE calling.
/// Idempotent: cancelling an already-cancelled listing is a no-op.
export function cancelListing(id: string): Listing | null {
  const l = store.get(id);
  if (!l) return null;
  if (l.cancelledAt) return l;
  l.cancelledAt = Date.now();
  store.set(id, l);
  return l;
}

/// Listing floor for negotiation: counters below this should be rejected.
export function listingFloor(listing: Listing): number {
  const pct = listing.negotiationMaxDecreasePct ?? 0;
  return listing.askingPriceUsdc * (1 - pct / 100);
}

/// Convenience for the marketplace renderer + scanners that want a derived
/// "what state is this in" without inlining the same logic three places.
/// A listing stays `open` even after it has matched briefs. one offer serves
/// many buyers in parallel, so a match is not a terminal state. `matched` stays
/// in the union for back-compat but is no longer returned; only cancel/expiry
/// closes a listing.
export type ListingStatus = 'open' | 'matched' | 'cancelled' | 'expired';
export function listingStatus(l: Listing): ListingStatus {
  if (l.cancelledAt) return 'cancelled';
  if (Date.now() > l.expiresAt) return 'expired';
  return 'open';
}
