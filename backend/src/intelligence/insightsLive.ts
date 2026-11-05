import { config } from '../config.js';
import { getBrief } from '../db/briefs.js';
import { getProfile } from '../db/profiles.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { questionsSince, type AgentQuestion } from '../db/agentQuestions.js';
import { getBuyerSnapshot, type BuyerJobSnapshot } from '../agents/buyer.js';
import { requestTitle } from '../agents/bidOutcome.js';
import { isPriced, waysOf } from '../agents/ways.js';
import type { CategoryId } from '../listings/categories.js';
import { categoryOfRequest } from './marketStore.js';
import { currentMarket } from './marketStoreLive.js';
import type { InsightFacts, OpenRequestFact } from './insights.js';

/// The facts behind a person's insights (view 52, step 1), read from Karwan's
/// own data. Nothing here writes or asks a model.

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const TIER_RANK = { new: 0, cold: 1, established: 2, strong: 3, elite: 4 } as const;

const isOpen = (j: BuyerJobSnapshot) => !j.finalized && !j.cancelledAt && !j.expiredAt && !j.escrowFunded;

/// A request the seller's lowest price sat above, which got no offer from them:
/// the agent asked and the answer was no, or no answer came.
export function isPriceMiss(q: Pick<AgentQuestion, 'side' | 'kind' | 'state' | 'answer'>): boolean {
  if (q.side !== 'seller' || q.kind !== 'price-below-floor') return false;
  return q.state === 'expired' || (q.state === 'answered' && q.answer?.choice === 'no');
}

/// The lowest price the person's agent may offer without asking, across their selling ways.
export function lowestPrice(ways: ReturnType<typeof waysOf>): number | null {
  const lows = ways.sell.filter(isPriced).map((w) => w.priceMin).filter((n) => n > 0);
  return lows.length ? Math.min(...lows) : null;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1]! + s[m]!) / 2);
}

/// Days sellers asked for on recent requests of each kind, from their offers.
export function usualDaysByCategory(jobs: readonly BuyerJobSnapshot[], now: number): Partial<Record<CategoryId, number>> {
  const by = new Map<CategoryId, number[]>();
  for (const j of jobs) {
    const brief = getBrief(j.jobId);
    if (!brief || now - brief.createdAt > 30 * DAY_MS) continue;
    const category = categoryOfRequest(brief);
    if (!category) continue;
    for (const b of j.bids) {
      const days = Math.ceil((b.deadlineUnix * 1000 - brief.createdAt) / DAY_MS);
      if (days > 0 && days < 366) by.set(category, [...(by.get(category) ?? []), days]);
    }
  }
  const out: Partial<Record<CategoryId, number>> = {};
  for (const [id, days] of by) if (days.length >= 3) out[id] = median(days);
  return out;
}

export async function gatherFacts(owner: string, sent: InsightFacts['sent'], now = Date.now()): Promise<InsightFacts> {
  const me = owner.toLowerCase();
  const [wallets, profile, questions] = await Promise.all([
    getAgentWallets(me).catch(() => null),
    getProfile(me).catch(() => null),
    questionsSince(me, now - WEEK_MS).catch(() => []),
  ]);
  const allJobs = getBuyerSnapshot().jobs;
  const mine = wallets?.buyerAddress ? allJobs.filter((j) => j.buyer.toLowerCase() === wallets.buyerAddress.toLowerCase()) : [];
  const openRequests: OpenRequestFact[] = mine.filter(isOpen).flatMap((j) => {
    const brief = getBrief(j.jobId);
    if (!brief) return [];
    const budget = Number(j.budgetUsdc);
    if (!(budget > 0)) return [];
    return [{
      jobId: j.jobId,
      title: requestTitle(brief.briefText) ?? 'your request',
      category: categoryOfRequest(brief),
      budgetUsdc: budget,
      deadlineDays: Math.max(1, Math.round((j.deadlineUnix * 1000 - brief.createdAt) / DAY_MS)),
      postedAt: brief.createdAt,
      offers: j.bids.length,
    }];
  });

  // The offer the buyer's agent would take: the best scored bid on an open
  // request, with the other bids the buyer can already see on that request.
  let pendingAccept: InsightFacts['pendingAccept'];
  for (const j of mine.filter(isOpen)) {
    const scored = j.bids.filter((b) => b.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = scored[0];
    if (!top) continue;
    const rank = (t: string | null) => (t && t in TIER_RANK ? TIER_RANK[t as keyof typeof TIER_RANK] : 0);
    pendingAccept = {
      jobId: j.jobId,
      title: requestTitle(getBrief(j.jobId)?.briefText) ?? 'your request',
      priceUsdc: Number(top.priceUsdc),
      sellerRating: rank(top.sellerTier),
      others: j.bids.filter((b) => b !== top).map((b) => ({ priceUsdc: Number(b.priceUsdc), rating: rank(b.sellerTier) })),
    };
    break;
  }

  return {
    network: config.ARC_NETWORK,
    openRequests,
    priceMisses7d: questions.filter(isPriceMiss).map((q) => ({ jobId: q.jobId, budgetUsdc: Number(q.facts.budgetUsdc) })).filter((m) => m.budgetUsdc > 0),
    lowestPriceUsdc: profile ? lowestPrice(waysOf(profile)) : null,
    bands: currentMarket(now).karwanPrices,
    usualDays: usualDaysByCategory(allJobs, now),
    ...(pendingAccept ? { pendingAccept } : {}),
    sent,
  };
}
