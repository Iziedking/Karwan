import { listAllBriefs, getBrief } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';
import type { KarwanEventType } from '../events.js';

/// Durable party scoping for the caller-aware event feeds (SSE stream,
/// /events/recent, /activity). Auction-phase events carry AGENT addresses in
/// their payloads, never the user identity, and the in-memory event ring holds
/// only the last 500 events globally, so scanning event payloads for the
/// caller cannot recognize a buyer watching their own live auction once
/// job.posted churns out of the ring. The stores that actually know the
/// parties are durable: the brief (postedBy), the deal row (buyer/seller), and
/// the match proposal (buyerUser/sellerUser). Seed from those.
export async function callerJobIds(caller: string): Promise<Set<string>> {
  const set = new Set<string>();
  const a = caller.toLowerCase();
  for (const b of listAllBriefs()) {
    if (b.postedBy === a && b.jobId) set.add(b.jobId.toLowerCase());
  }
  const [deals, proposals] = await Promise.all([
    listDealsForAddress(a).catch(() => []),
    listMatchProposalsForUser(a).catch(() => []),
  ]);
  for (const d of deals) set.add(d.jobId.toLowerCase());
  for (const p of proposals) set.add(p.jobId.toLowerCase());
  return set;
}

/// Cheap live fallback for a job created AFTER a stream was seeded: the brief
/// store is in-memory, so checking the poster costs nothing on the SSE hot
/// path. Deals and proposals created mid-stream are covered by their own
/// events, which restate the user parties (deal.matched, near-miss).
export function isBriefPoster(jobId: string, caller: string): boolean {
  const brief = getBrief(jobId);
  return !!brief && brief.postedBy === caller;
}

/// Jobs on which the caller is the BUYER (posted the brief, or is the buyer
/// side of a deal/proposal). A strict subset of callerJobIds: a matched seller
/// is a party to the job but must not count as its buyer. Powers the auction
/// privacy gate below — the bidder roster and the buyer agent's negotiation
/// internals belong to the buyer who ran the auction, never to the seller who
/// only needs to accept their match.
export async function buyerJobIds(caller: string): Promise<Set<string>> {
  const set = new Set<string>();
  const a = caller.toLowerCase();
  for (const b of listAllBriefs()) {
    if (b.postedBy === a && b.jobId) set.add(b.jobId.toLowerCase());
  }
  const [deals, proposals] = await Promise.all([
    listDealsForAddress(a).catch(() => []),
    listMatchProposalsForUser(a).catch(() => []),
  ]);
  for (const d of deals) if (d.buyer.toLowerCase() === a) set.add(d.jobId.toLowerCase());
  for (const p of proposals) if (p.buyerUser.toLowerCase() === a) set.add(p.jobId.toLowerCase());
  return set;
}

/// Competitive auction internals: every other seller's bid, its score, the
/// buyer agent's counters and candidate churn, and the buyer's private market
/// strategy (near-miss, overpay advisory, out-of-reach). These belong to the
/// buyer who ran the auction. A matched seller is a party to the job — so the
/// generic party gate would hand them full detail — but they must only ever
/// see who else bid via NOTHING: a pulse (type + actor + time, no payload).
/// Their own match and settlement thread (bid.accepted, escrow.*, deal.*)
/// is NOT in this set and passes through in full. Bid/counter events carry
/// only agent addresses (never the seller's user id), so we cannot single out
/// the seller's own bid from a rival's at the event layer; masking the whole
/// class is the only leak-proof rule.
export const AUCTION_INTERNAL_TYPES: ReadonlySet<KarwanEventType> = new Set<KarwanEventType>([
  'bid.scored',
  'bid.submitted',
  'counter.issued',
  'counter.received',
  'counter.evaluated',
  'counter.response.submitted',
  'agent.skipped',
  'agent.declined',
  'agent.decision',
  'negotiation.attempt-ended',
  'negotiation.next-candidate',
  'negotiation.exhausted',
  'negotiation.near-miss',
  'negotiation.near-miss.proceeded',
  'negotiation.near-miss.declined',
  'negotiation.near-miss.skipped',
  'negotiation.near-miss.superseded',
  'negotiation.reopened',
  'negotiation.market-advisory',
  'negotiation.out-of-reach',
  'market.scanned',
]);
