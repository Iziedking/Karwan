import type { Brief } from '../db/briefs.js';

/// The open requests a seller fits (view 44, Market Sell): those whose last
/// published shortlist names them. Only ids go out; the shortlist itself stays
/// with the person who posted the request.
export function requestsThatFit(seller: string, briefs: Iterable<Brief>): string[] {
  const me = seller.toLowerCase();
  const out: string[] = [];
  for (const brief of briefs) {
    if (brief.expiredAt || brief.negotiationEndedAt) continue;
    if (brief.shortlist?.some((entry) => entry.sellerUser?.toLowerCase() === me)) out.push(brief.jobId);
  }
  return out;
}
