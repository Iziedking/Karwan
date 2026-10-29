import { formatUnits } from 'viem';
import { topicalMatchScore } from '../llm/keywords.js';
import { buildCandidates, type ShortlistBid, type ShortlistDeps } from '../agents/shortlistRun.js';
import { pickRecommended, rankCandidates, sealEntries, toEntries } from '../agents/shortlist.js';
import type { WorkOffer, WorkRequest } from '../db/workRequests.js';
import type { RankedOffer } from './workRequests.js';

/// The hirer's agent ranks rates on hourly work the way it ranks every request
/// (view 32): skill fit from what the seller sells and has done first,
/// verified above unverified inside a fit, rating, then the lower rate. The
/// rows leave sealed, with no score or count.

export interface WorkRankDeps extends ShortlistDeps {
  /// What the seller sells and has done, the words skill fit is read from.
  sellerWords(user: string): Promise<string[]>;
  /// On testnet a clean record may stand in for verification when picking.
  cleanRecordCounts: boolean;
}

export async function rankWorkOffers(r: WorkRequest, offers: readonly WorkOffer[], deps: WorkRankDeps, nowMs: number): Promise<RankedOffer[]> {
  if (offers.length === 0) return [];
  const bids: ShortlistBid[] = await Promise.all(
    offers.map(async (o) => {
      const words = await deps.sellerWords(o.seller).catch(() => [] as string[]);
      return {
        seller: o.sellerAgent,
        sellerUserAddress: o.seller,
        priceUsdc: formatUnits(BigInt(o.rateMicros), 6),
        deadlineUnix: Math.floor(r.startsAt / 1000),
        ...(r.keywords.length ? { topicalMatch: topicalMatchScore(r.keywords, words) } : {}),
        deterministicScore: 0,
        title: o.note,
      };
    }),
  );
  // The list reads at most five people; the best fits go in first.
  bids.sort((a, b) => (b.topicalMatch ?? 0) - (a.topicalMatch ?? 0));
  const candidates = await buildCandidates({ jobId: r.id, buyerAgent: r.hirer, buyerUser: r.hirer, bids, nowUnix: Math.floor(nowMs / 1000) }, deps);
  const ranked = rankCandidates(candidates);
  const most = Number(formatUnits(BigInt(r.maxRateMicros), 6));
  const recommended = pickRecommended(ranked, most, new Set(), { cleanRecordCounts: deps.cleanRecordCounts });
  const entries = sealEntries(toEntries(ranked, recommended, most, null, []));
  return entries.map((e) => {
    const o = offers.find((x) => x.sellerAgent.toLowerCase() === e.seller.toLowerCase())!;
    return {
      offerId: o.id, seller: o.seller, name: e.name, tag: e.tag, verified: e.verified, tier: e.tier, rating: e.rating,
      reasons: e.reasons, recommended: e.recommended, rateMicros: o.rateMicros, note: o.note,
      overMost: BigInt(o.rateMicros) > BigInt(r.maxRateMicros),
    };
  });
}
