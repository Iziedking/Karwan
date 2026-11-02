import type { Brief } from '../db/briefs.js';

/// The open requests a seller fits (view 44, Market Sell): those whose last
/// published shortlist names them. Only ids go out; the shortlist itself stays
/// with the person who posted the request. A request with no deal yet stays
/// open until its date (view 46), so it still counts.
export function requestsThatFit(seller: string, briefs: Iterable<Brief>): string[] {
  const me = seller.toLowerCase();
  const out: string[] = [];
  for (const brief of briefs) {
    if (brief.expiredAt) continue;
    if (brief.shortlist?.some((entry) => entry.sellerUser?.toLowerCase() === me)) out.push(brief.jobId);
  }
  return out;
}
