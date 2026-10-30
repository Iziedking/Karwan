import { topicalMatchScore } from '../llm/keywords.js';
import type { PublicRating } from '../ratings/rules.js';
import { buildCandidates, type ShortlistBid, type ShortlistDeps } from './shortlistRun.js';
import { SHORTLIST_MAX, pickRecommended, rankCandidates, sealEntries, toEntries, type ShortlistCandidate } from './shortlist.js';

/// The seller block on every offer, fixed price or hourly (view 32). The
/// buyer's agent ranks the people who offered with the request shortlist's own
/// rules: skill fit from what they sell and have done, verified above
/// unverified inside a fit, rating, then price. Rows leave sealed: name, tag,
/// verified, tier, rating and up to three reasons, never a score or a count.

export interface SealedSellerDeps extends ShortlistDeps {
  /// What the seller sells and has done, the words skill fit is read from.
  sellerWords(user: string): Promise<string[]>;
  /// On testnet a clean record may stand in for verification when picking.
  cleanRecordCounts: boolean;
}

export interface SellerOffer {
  sellerUser: string;
  sellerAgent: string;
  priceUsdc: string;
  deadlineUnix: number;
  note: string;
}

export interface SealedSeller {
  sellerAgent: string;
  name: string;
  tag: string | null;
  verified: boolean;
  tier: string;
  rating: PublicRating;
  reasons: string[];
  recommended: boolean;
}

/// Best fit first. Every offer gets a row, however many came in.
export async function sealedSellers(
  input: { requestId: string; buyer: string; budgetUsdc: string; keywords: readonly string[]; offers: readonly SellerOffer[] },
  deps: SealedSellerDeps,
  nowMs: number,
): Promise<SealedSeller[]> {
  if (input.offers.length === 0) return [];
  const bids: ShortlistBid[] = await Promise.all(
    input.offers.map(async (o) => {
      const words = await deps.sellerWords(o.sellerUser).catch(() => [] as string[]);
      return {
        seller: o.sellerAgent,
        sellerUserAddress: o.sellerUser,
        priceUsdc: o.priceUsdc,
        deadlineUnix: o.deadlineUnix,
        ...(input.keywords.length ? { topicalMatch: topicalMatchScore([...input.keywords], words) } : {}),
        deterministicScore: 0,
        title: o.note,
      };
    }),
  );
  bids.sort((a, b) => (b.topicalMatch ?? 0) - (a.topicalMatch ?? 0));
  // The shortlist reads and lists five at a time.
  const nowUnix = Math.floor(nowMs / 1000);
  const candidates: ShortlistCandidate[] = [];
  for (let i = 0; i < bids.length; i += SHORTLIST_MAX) {
    candidates.push(...(await buildCandidates({ jobId: input.requestId, buyerAgent: input.buyer, buyerUser: input.buyer, bids: bids.slice(i, i + SHORTLIST_MAX), nowUnix }, deps)));
  }
  const ranked = rankCandidates(candidates);
  const budget = Number(input.budgetUsdc);
  const recommended = pickRecommended(ranked, budget, new Set(), { cleanRecordCounts: deps.cleanRecordCounts });
  const rows: SealedSeller[] = [];
  for (let i = 0; i < ranked.length; i += SHORTLIST_MAX) {
    for (const e of sealEntries(toEntries(ranked.slice(i, i + SHORTLIST_MAX), recommended, budget, null, []))) {
      rows.push({ sellerAgent: e.seller, name: e.name, tag: e.tag, verified: e.verified, tier: e.tier, rating: e.rating, reasons: [...e.reasons], recommended: e.recommended });
    }
  }
  return rows;
}
