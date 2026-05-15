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
  /** Set when this listing has triggered a matched bid; prevents re-firing. */
  matchedAt?: number;
  matchedJobId?: string;
}

const store = new Map<string, Listing>();

export function getListing(id: string): Listing | null {
  return store.get(id) ?? null;
}

export function createListing(
  input: Omit<Listing, 'id' | 'postedAt' | 'matchedAt' | 'matchedJobId'>,
): Listing {
  const id = `lst_${randomBytes(8).toString('hex')}`;
  const listing: Listing = {
    ...input,
    id,
    sellerUser: input.sellerUser.toLowerCase(),
    sellerAgent: input.sellerAgent.toLowerCase(),
    postedAt: Date.now(),
  };
  store.set(id, listing);
  return listing;
}

export function listOpenListings(): Listing[] {
  return [...store.values()].filter((l) => !l.matchedAt);
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

export function markListingMatched(id: string, jobId: string): void {
  const l = store.get(id);
  if (!l) return;
  l.matchedAt = Date.now();
  l.matchedJobId = jobId;
  store.set(id, l);
}

/// Listing floor for negotiation: counters below this should be rejected.
export function listingFloor(listing: Listing): number {
  const pct = listing.negotiationMaxDecreasePct ?? 0;
  return listing.askingPriceUsdc * (1 - pct / 100);
}
