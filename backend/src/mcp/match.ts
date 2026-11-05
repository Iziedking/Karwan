import type { SealedSeller, SellerOffer } from '../agents/sealedSellers.js';
import { isPriced, type AgentWays } from '../agents/ways.js';
import type { IndexedSeller, RequestForIndex } from '../matching/sellerIndex.js';
import { ratingLine } from '../ratings/rules.js';

/// find_counterparty for an agent outside Karwan (view 15): sellers who fit
/// the need, ranked inside Karwan on their full records, answered with sealed
/// rows only. Never a score, a count or an outcome (D23).

export const FIND_MAX = 5;
const CANDIDATES = 15;

export interface FindDeps {
  sellers(request: RequestForIndex): Promise<IndexedSeller[]>;
  profile(user: string): Promise<{ handle?: string; agentWays?: AgentWays; settings?: { acceptsOutsideAgents?: boolean } } | null>;
  seal(input: { requestId: string; buyer: string; budgetUsdc: string; keywords: readonly string[]; offers: readonly SellerOffer[] }): Promise<SealedSeller[]>;
  nowMs: number;
}

export interface FoundSeller {
  tag: string;
  name: string;
  verified: boolean;
  tier: string;
  rating: string;
  reasons: string[];
  priceUsdc: string;
  days: number;
  recommended: boolean;
}

const words = (need: string) => need.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

export async function findForAgent(input: { need: string; budgetUsdc: number; deadlineDays: number; agentAddress: string }, deps: FindDeps): Promise<FoundSeller[]> {
  const keywords = words(input.need);
  const ranked = await deps.sellers({ jobId: `mcp:${input.agentAddress}`, keywords, briefText: input.need, tradeType: 'service' });
  const offers: Array<SellerOffer & { tag: string; days: number }> = [];
  for (const s of ranked.slice(0, CANDIDATES)) {
    const profile = await deps.profile(s.userAddress).catch(() => null);
    if (!profile?.handle || profile.settings?.acceptsOutsideAgents === false) continue;
    const way = profile.agentWays?.sell.find(isPriced);
    // A seller whose lowest price is above the budget is not offered.
    if (way && way.priceMin > input.budgetUsdc) continue;
    const price = way ? Math.min(way.priceUsual, input.budgetUsdc) : input.budgetUsdc;
    // Nor one who cannot deliver inside the deadline.
    const fastest = way ? ('daysMin' in way ? way.daysMin : way.arriveDaysMin) : 1;
    if (fastest > input.deadlineDays) continue;
    const slowest = way ? ('daysMax' in way ? way.daysMax : way.arriveDaysMax) : input.deadlineDays;
    const days = Math.min(slowest, input.deadlineDays);
    offers.push({
      sellerUser: s.userAddress, sellerAgent: s.sellerAddress, priceUsdc: String(price),
      deadlineUnix: Math.floor(deps.nowMs / 1000) + days * 86_400, note: input.need, tag: profile.handle, days,
    });
  }
  if (offers.length === 0) return [];
  const rows = await deps.seal({ requestId: `mcp:${input.agentAddress}`, buyer: input.agentAddress, budgetUsdc: String(input.budgetUsdc), keywords, offers });
  return rows.slice(0, FIND_MAX).flatMap((r) => {
    const o = offers.find((x) => x.sellerAgent.toLowerCase() === r.sellerAgent.toLowerCase());
    if (!o) return [];
    return [{
      tag: `@${o.tag}`, name: r.name, verified: r.verified, tier: r.tier, rating: ratingLine(r.rating),
      reasons: r.reasons, priceUsdc: o.priceUsdc, days: o.days, recommended: r.recommended,
    }];
  });
}
