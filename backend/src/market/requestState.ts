import { createHash } from 'node:crypto';

/// Where a request stands on the open market (view 53), and the offers on it
/// that anyone may read. Pure: callers pass what the stores hold.

export type RequestState = 'open' | 'negotiating' | 'agreed' | 'ended';

/// An agreed request stays on the market this long after the deal is made.
export const AGREED_LISTED_MS = 7 * 24 * 60 * 60 * 1000;

type ProposalFacts = { proposedAt: number; approvedAt?: number; declinedAt?: number };

export function requestState(f: {
  finalized: boolean;
  escrowFunded: boolean;
  proposal: ProposalFacts | null;
  deal: boolean;
  nearMiss: boolean;
}): { state: RequestState; agreedAt: number | null } {
  const live = f.proposal && !f.proposal.declinedAt ? f.proposal : null;
  if (f.deal || f.escrowFunded || live?.approvedAt) {
    return { state: 'agreed', agreedAt: live ? (live.approvedAt ?? live.proposedAt) : null };
  }
  if (live || f.nearMiss) return { state: 'negotiating', agreedAt: null };
  if (f.finalized) return { state: 'ended', agreedAt: null };
  return { state: 'open', agreedAt: null };
}

export function listed(s: { state: RequestState; agreedAt: number | null }, nowMs: number): boolean {
  if (s.state === 'open' || s.state === 'negotiating') return true;
  if (s.state === 'agreed') return s.agreedAt !== null && nowMs - s.agreedAt < AGREED_LISTED_MS;
  return false;
}

export type PublicOffer = {
  id: string;
  kind: 'hand' | 'agent';
  /// For the caller to look the seller up by name; never sent to a client.
  sellerUser: string;
  priceUsdc: string;
  deliverByUnix: number;
  note: string | null;
  chosen: boolean;
};

type HandOffer = {
  id: string;
  sellerUser: string;
  priceUsdc: string;
  deliverByUnix: number;
  note: string;
  state: string;
  lapsesAt: number;
};

type AgentBid = { sellerUser: string | null; priceUsdc: string; deadlineUnix: number };

/// Hand offers that are live or were accepted, and agent bids from sellers who
/// did not also offer by hand (a hand offer replaces the agent's bid). Cheapest first.
export function publicOffers(
  hand: readonly HandOffer[],
  bids: readonly AgentBid[],
  chosenSeller: string | null,
  nowSec: number,
): PublicOffer[] {
  const chosen = chosenSeller?.toLowerCase() ?? null;
  const out: PublicOffer[] = [];
  const handSellers = new Set<string>();
  for (const o of hand) {
    const live = o.state === 'pending' && o.lapsesAt > nowSec;
    if (!live && o.state !== 'accepted') continue;
    const seller = o.sellerUser.toLowerCase();
    handSellers.add(seller);
    out.push({
      id: o.id,
      kind: 'hand',
      sellerUser: seller,
      priceUsdc: o.priceUsdc,
      deliverByUnix: o.deliverByUnix,
      note: o.note.trim() || null,
      chosen: o.state === 'accepted' || seller === chosen,
    });
  }
  for (const b of bids) {
    if (!b.sellerUser) continue;
    const seller = b.sellerUser.toLowerCase();
    if (handSellers.has(seller)) continue;
    out.push({
      // A hash, so the id never carries the seller's address.
      id: `agent:${createHash('sha256').update(seller).digest('hex').slice(0, 12)}`,
      kind: 'agent',
      sellerUser: seller,
      priceUsdc: b.priceUsdc,
      deliverByUnix: b.deadlineUnix,
      note: null,
      chosen: seller === chosen,
    });
  }
  return out.sort((a, b) => Number(a.priceUsdc) - Number(b.priceUsdc));
}
