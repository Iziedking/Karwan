import { listAllBriefs, getBrief } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';

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
