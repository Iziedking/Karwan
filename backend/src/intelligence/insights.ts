import type { CategoryId } from '../listings/categories.js';
import type { PriceBand } from './marketStore.js';

/// What the agent tells its person about how they trade (view 52, step 1).
/// Every number here is computed from Karwan's own data; no model is asked.
/// A sentence is a template filled from these numbers, in every channel.

export type InsightKind = 'testnet-budget' | 'missed-by-price' | 'budget-below-band' | 'cheaper-better-sellers' | 'slow-request';

/// The one thing the person can do about an insight. It runs through the
/// existing edit tools and the confirm card; nothing changes without them.
export type InsightAction =
  | { kind: 'set-request-budget'; jobId: string; budgetUsdc: number }
  | { kind: 'set-request-days'; jobId: string; days: number }
  | { kind: 'set-lowest-price'; priceUsdc: number }
  | { kind: 'show-offers'; jobId: string };

export interface Insight {
  kind: InsightKind;
  /// Repeat key: the same key within a week is not told again.
  key: string;
  jobId?: string;
  title?: string;
  numbers: Record<string, number>;
  action: InsightAction;
  /// How much the action would change things, as a share of where they are now.
  weight: number;
}

export interface OpenRequestFact {
  jobId: string;
  title: string;
  category: CategoryId | null;
  budgetUsdc: number;
  deadlineDays: number;
  postedAt: number;
  offers: number;
}

export interface InsightFacts {
  network: 'testnet' | 'mainnet';
  openRequests: readonly OpenRequestFact[];
  /// Requests in the last 7 days whose budget sat under this seller's lowest
  /// price and that never got an offer from them: the agent asked and the
  /// answer was no, or none came (view 41 questions, kind price-below-floor).
  priceMisses7d: ReadonlyArray<{ jobId: string; budgetUsdc: number }>;
  lowestPriceUsdc: number | null;
  bands: Partial<Record<CategoryId, PriceBand>>;
  /// The middle number of days settled deals of each kind took.
  usualDays: Partial<Record<CategoryId, number>>;
  /// An offer the person is about to accept, and the other offers on the same request they can see.
  pendingAccept?: { jobId: string; title: string; priceUsdc: number; sellerRating: number; others: ReadonlyArray<{ priceUsdc: number; rating: number }> };
  /// What was told in the last week: the key, when, and the number it turned on.
  sent: ReadonlyArray<{ key: string; at: number; value: number }>;
}

export const MAX_INSIGHTS = 3;
const DAY_MS = 86_400_000;
const REPEAT_QUIET_MS = 7 * DAY_MS;
const REPEAT_MOVE = 0.1;
const MISSED_MIN = 3;
const CHEAPER_MIN = 2;

const round2 = (n: number) => Math.round(n * 100) / 100;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/// The number an insight turns on, so a repeat is told again only when it moved.
function valueOf(i: Insight): number {
  switch (i.action.kind) {
    case 'set-request-budget': return i.action.budgetUsdc;
    case 'set-request-days': return i.action.days;
    case 'set-lowest-price': return i.action.priceUsdc;
    case 'show-offers': return i.numbers.lowestUsdc ?? 0;
  }
}

function quiet(i: Insight, sent: InsightFacts['sent'], now: number): boolean {
  const last = sent.filter((s) => s.key === i.key && now - s.at < REPEAT_QUIET_MS).sort((a, b) => b.at - a.at)[0];
  if (!last) return false;
  const v = valueOf(i);
  const base = Math.abs(last.value) || 1;
  return Math.abs(v - last.value) / base < REPEAT_MOVE;
}

function forRequest(r: OpenRequestFact, f: InsightFacts, now: number): Insight[] {
  const out: Insight[] = [];
  const band = r.category ? f.bands[r.category] : undefined;
  const age = now - r.postedAt;
  if (band && f.network === 'testnet' && (r.budgetUsdc > band.high || (r.offers === 0 && age >= DAY_MS && r.budgetUsdc > band.mid))) {
    out.push({
      kind: 'testnet-budget', key: `testnet-budget|${r.jobId}`, jobId: r.jobId, title: r.title,
      numbers: { budgetUsdc: r.budgetUsdc, lowUsdc: band.low, highUsdc: band.high, suggestedUsdc: band.mid },
      action: { kind: 'set-request-budget', jobId: r.jobId, budgetUsdc: band.mid },
      weight: (r.budgetUsdc - band.mid) / r.budgetUsdc,
    });
  }
  if (band && r.budgetUsdc < band.low) {
    out.push({
      kind: 'budget-below-band', key: `budget-below-band|${r.jobId}`, jobId: r.jobId, title: r.title,
      numbers: { budgetUsdc: r.budgetUsdc, lowUsdc: band.low, highUsdc: band.high, deals: band.deals },
      action: { kind: 'set-request-budget', jobId: r.jobId, budgetUsdc: band.low },
      weight: (band.low - r.budgetUsdc) / band.low,
    });
  }
  const usual = r.category ? f.usualDays[r.category] : undefined;
  if (r.offers === 0 && age >= DAY_MS && usual !== undefined && usual > r.deadlineDays) {
    out.push({
      kind: 'slow-request', key: `slow-request|${r.jobId}`, jobId: r.jobId, title: r.title,
      numbers: { days: r.deadlineDays, usualDays: usual },
      action: { kind: 'set-request-days', jobId: r.jobId, days: usual },
      weight: (usual - r.deadlineDays) / usual,
    });
  }
  return out;
}

function missedByPrice(f: InsightFacts): Insight | null {
  const missed = f.priceMisses7d;
  if (missed.length < MISSED_MIN || f.lowestPriceUsdc === null) return null;
  const buyers = round2(median(missed.map((p) => p.budgetUsdc)));
  if (!(buyers > 0) || buyers >= f.lowestPriceUsdc) return null;
  return {
    kind: 'missed-by-price', key: 'missed-by-price',
    numbers: { count: missed.length, buyersMedianUsdc: buyers, lowestPriceUsdc: f.lowestPriceUsdc },
    action: { kind: 'set-lowest-price', priceUsdc: buyers },
    weight: (f.lowestPriceUsdc - buyers) / f.lowestPriceUsdc,
  };
}

function cheaperBetterSellers(f: InsightFacts): Insight | null {
  const p = f.pendingAccept;
  if (!p) return null;
  const better = p.others.filter((o) => o.priceUsdc < p.priceUsdc && o.rating >= p.sellerRating);
  if (better.length < CHEAPER_MIN) return null;
  const lowest = Math.min(...better.map((o) => o.priceUsdc));
  return {
    kind: 'cheaper-better-sellers', key: `cheaper-better-sellers|${p.jobId}`, jobId: p.jobId, title: p.title,
    numbers: { count: better.length, lowestUsdc: lowest, bestRating: Math.max(...better.map((o) => o.rating)), priceUsdc: p.priceUsdc },
    action: { kind: 'show-offers', jobId: p.jobId },
    weight: (p.priceUsdc - lowest) / p.priceUsdc,
  };
}

/// Up to three insights, the ones that would change the most first. An insight
/// told in the last week is held back unless its number moved by a tenth.
export function insightsFor(f: InsightFacts, now: number): Insight[] {
  const all = [
    ...f.openRequests.flatMap((r) => forRequest(r, f, now)),
    missedByPrice(f),
    cheaperBetterSellers(f),
  ].filter((i): i is Insight => i !== null && i.weight > 0);
  return all
    .filter((i) => !quiet(i, f.sent, now))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_INSIGHTS);
}

/// What to remember after telling: the key, when, and the number it turned on.
export function sentRecord(i: Insight, now: number): { key: string; at: number; value: number } {
  return { key: i.key, at: now, value: valueOf(i) };
}
