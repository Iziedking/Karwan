import { formatUnits } from 'viem';
import { sealedSellers, type SealedSellerDeps } from '../agents/sealedSellers.js';
import type { WorkOffer, WorkRequest } from '../db/workRequests.js';
import type { RankedOffer } from './workRequests.js';

/// The hirer's agent ranks rates on hourly work the way it ranks every request
/// (view 32): skill fit from what the seller sells and has done first,
/// verified above unverified inside a fit, rating, then the lower rate. The
/// rows leave sealed, with no score or count.

export type WorkRankDeps = SealedSellerDeps;

export async function rankWorkOffers(r: WorkRequest, offers: readonly WorkOffer[], deps: WorkRankDeps, nowMs: number): Promise<RankedOffer[]> {
  const rows = await sealedSellers(
    {
      requestId: r.id,
      buyer: r.hirer,
      budgetUsdc: formatUnits(BigInt(r.maxRateMicros), 6),
      keywords: r.keywords,
      offers: offers.map((o) => ({ sellerUser: o.seller, sellerAgent: o.sellerAgent, priceUsdc: formatUnits(BigInt(o.rateMicros), 6), deadlineUnix: Math.floor(r.startsAt / 1000), note: o.note })),
    },
    deps,
    nowMs,
  );
  return rows.map((e) => {
    const o = offers.find((x) => x.sellerAgent.toLowerCase() === e.sellerAgent.toLowerCase())!;
    return {
      offerId: o.id, seller: o.seller, name: e.name, tag: e.tag, verified: e.verified, tier: e.tier, rating: e.rating,
      reasons: e.reasons, recommended: e.recommended, rateMicros: o.rateMicros, note: o.note,
      overMost: BigInt(o.rateMicros) > BigInt(r.maxRateMicros),
    };
  });
}
