import type { BuyerCheck, Listing, MatchProposal, SellerActiveBid, SellerBidOutcome, SellerWorldCheck } from '@/core/api';

export type BidState = 'offered' | 'negotiating' | 'won' | 'lost' | 'withdrawn' | 'expired' | 'passed';
export type BuyerFlag = Exclude<BuyerCheck['reason'], 'record-ok'>;
export interface BuyerCheckLine {
  paidUsdc: number;
  completed: number;
  repeatSellers: number;
  disputesLost: number;
  score: number;
  flag: BuyerFlag | null;
  late: boolean;
}
export interface NeedsYouLine { jobId: string; title: string | null; priceUsdc: string }
export interface BidLine {
  jobId: string;
  title: string | null;
  state: BidState;
  priceUsdc: string;
  withdrawable: boolean;
  check: BuyerCheckLine | null;
}
export interface OfferLine { id: string; title: string; priceUsdc: number; daysLeft: number }
export interface SellerDesk {
  needsYou: NeedsYouLine[];
  bidding: BidLine[];
  offers: OfferLine[];
  /// Buyers who chose me and wait on my World ID check before escrow funds.
  worldChecks: SellerWorldCheck[];
  empty: boolean;
}

const ENDED_SHOWN = 10;
const DAY_MS = 86_400_000;

function checkLine(c: BuyerCheck | null | undefined): BuyerCheckLine | null {
  if (!c) return null;
  return {
    paidUsdc: c.paidUsdc,
    completed: c.asBuyer.completed,
    repeatSellers: c.asBuyer.repeatSellers,
    disputesLost: c.disputesLost,
    score: c.score,
    flag: c.reason === 'record-ok' ? null : c.reason,
    late: c.late === true,
  };
}

/// The seller's desk in the order it is read: what needs them, what their
/// agent is bidding on, what they offer. Only the seller's own prices appear.
export function sellerDeskView(input: {
  me: string;
  matches: MatchProposal[];
  bids: SellerActiveBid[];
  recentBids: SellerBidOutcome[];
  listings: Listing[];
  worldChecks?: SellerWorldCheck[];
  now: number;
}): SellerDesk {
  const me = input.me.toLowerCase();
  const titleOf = new Map<string, string | null>();
  for (const r of input.recentBids) titleOf.set(r.jobId.toLowerCase(), r.title ?? null);
  for (const b of input.bids) titleOf.set(b.jobId.toLowerCase(), b.title ?? null);

  const needsYou = input.matches
    .filter((p) => p.sellerUser.toLowerCase() === me && !p.approvedAt && !p.declinedAt)
    .filter((p) => !(p.awaitingParty === 'buyer' && p.raisedPriceUsdc))
    .map((p) => ({ jobId: p.jobId, title: titleOf.get(p.jobId.toLowerCase()) ?? null, priceUsdc: p.agreedPriceUsdc }));

  const live: BidLine[] = input.bids.map((b) => ({
    jobId: b.jobId,
    title: b.title ?? null,
    state: !b.finalized && b.counterRounds > 0 ? 'negotiating' : 'offered',
    priceUsdc: b.lastBidPrice,
    withdrawable: !b.finalized,
    check: checkLine(b.buyerCheck),
  }));
  const liveIds = new Set(input.bids.map((b) => b.jobId.toLowerCase()));
  const ended: BidLine[] = [...input.recentBids]
    .filter((r) => !liveIds.has(r.jobId.toLowerCase()))
    .sort((a, b) => b.at - a.at)
    .slice(0, ENDED_SHOWN)
    .map((r) => ({
      jobId: r.jobId,
      title: r.title ?? null,
      state: r.outcome,
      priceUsdc: r.lastPrice,
      withdrawable: false,
      check: checkLine(r.buyerCheck),
    }));

  const offers = input.listings
    .filter((l) => !l.cancelledAt && !l.matchedAt && l.expiresAt > input.now)
    .sort((a, b) => b.postedAt - a.postedAt)
    .map((l) => ({
      id: l.id,
      title: l.title,
      priceUsdc: l.askingPriceUsdc,
      daysLeft: Math.ceil((l.expiresAt - input.now) / DAY_MS),
    }));

  const bidding = [...live, ...ended];
  const worldChecks = input.worldChecks ?? [];
  return {
    needsYou,
    bidding,
    offers,
    worldChecks,
    empty: needsYou.length === 0 && bidding.length === 0 && offers.length === 0 && worldChecks.length === 0,
  };
}
