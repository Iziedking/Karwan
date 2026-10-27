/// Every request that fits a seller reaches them (view 35, decision 7). A
/// request outside the price or time range the seller set is not bid on, but
/// when it fits what they sell, the seller hears about it once, with what is
/// outside the range, and decides. The fit is judged the way bidding judges
/// it: shared words, then the sourcing sector, then a confident relevance call.

import { topicalOverlap } from '../llm/keywords.js';

export type OutOfRange = 'below-min' | 'above-max' | 'too-soon' | 'too-late';

/// Which part of the request sits outside the seller's range, or null.
export function outOfRangeKind(
  seller: { minBudgetUsdc: number; maxBudgetUsdc: number; minDeadlineDays: number; maxDeadlineDays: number },
  job: { budgetUsdc: string; deadlineUnix: number },
  nowUnix: number,
): OutOfRange | null {
  const budget = Number(job.budgetUsdc);
  if (budget < seller.minBudgetUsdc) return 'below-min';
  if (budget > seller.maxBudgetUsdc) return 'above-max';
  const days = Math.ceil((job.deadlineUnix - nowUnix) / 86_400);
  if (days < seller.minDeadlineDays) return 'too-soon';
  if (days > seller.maxDeadlineDays) return 'too-late';
  return null;
}

/// The sentence the email, Telegram and the bell share.
export function outOfRangeLine(n: { outOfRange: OutOfRange; budgetUsdc: string; limit: number; days: number }): string {
  const dayWord = (d: number) => `${d} ${d === 1 ? 'day' : 'days'}`;
  switch (n.outOfRange) {
    case 'below-min':
      return `Its budget is ${n.budgetUsdc} USDC, under your ${n.limit} USDC minimum.`;
    case 'above-max':
      return `Its budget is ${n.budgetUsdc} USDC, over your ${n.limit} USDC maximum.`;
    case 'too-soon':
      return `It is due in ${dayWord(n.days)}, sooner than the ${dayWord(n.limit)} you need.`;
    case 'too-late':
      return `It is due in ${dayWord(n.days)}, later than the ${dayWord(n.limit)} you take on.`;
  }
}

const KINDS: readonly OutOfRange[] = ['below-min', 'above-max', 'too-soon', 'too-late'];

/// The range detail on a suggestion event, or null for an "Ask me first" one.
export function rangeOf(payload: Record<string, unknown> | undefined): { outOfRange: OutOfRange; budgetUsdc: string; limit: number; days: number } | null {
  const kind = payload?.outOfRange;
  if (typeof kind !== 'string' || !KINDS.includes(kind as OutOfRange)) return null;
  const limit = Number(payload?.limit);
  const days = Number(payload?.days);
  const budget = payload?.budgetUsdc;
  if (!Number.isFinite(limit) || !Number.isFinite(days) || typeof budget !== 'string') return null;
  return { outOfRange: kind as OutOfRange, budgetUsdc: budget, limit, days };
}

/// The same bar the relevance bridge sets for bidding.
const RELEVANCE_MIN_CONFIDENCE = 0.6;

export async function requestFits(input: {
  briefTags: string[];
  sellerTags: string[];
  sectorFits: () => Promise<boolean>;
  judge: () => Promise<{ relevant: boolean; confidence: number }>;
}): Promise<boolean> {
  // Without words on both sides there is nothing to judge, so nobody is told.
  if (!input.briefTags.length || !input.sellerTags.length) return false;
  if (topicalOverlap(input.briefTags, input.sellerTags) > 0) return true;
  if (await input.sectorFits()) return true;
  const call = await input.judge();
  return call.relevant && call.confidence >= RELEVANCE_MIN_CONFIDENCE;
}
