import { CATEGORY_IDS, CATEGORY_NAMES, inferCategory, type CategoryId } from '../listings/categories.js';

/// One market store (view 48, step 4). Demand and prices by the market's ten
/// categories, from Karwan's own requests, offers and deals first. Raw request
/// keywords were the unit before, and one request gives many near-synonyms,
/// so no keyword ever rose and almost every price bucket held one deal.

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/// Deals older than this do not shape a price band.
const BAND_WINDOW_MS = 30 * DAY_MS;
const BAND_MIN_DEALS = 3;

export interface DemandRequest {
  briefText?: string;
  keywords?: string[];
  createdAt: number;
  seedKey?: string;
}

export interface DemandOffer {
  title: string;
  description: string;
  category?: CategoryId;
  expiresAt: number;
}

export interface CategoryDemand {
  id: CategoryId;
  name: string;
  thisWeek: number;
  lastWeek: number;
  openOffers: number;
  rising: boolean;
}

export function categoryOfRequest(r: Pick<DemandRequest, 'briefText' | 'keywords'>): CategoryId | null {
  return inferCategory(`${r.briefText ?? ''} ${(r.keywords ?? []).join(' ')}`);
}

/// A category is rising when it has at least two requests this week, more than
/// last week, and a gain of at least a tenth of all requests this week (one in
/// a quiet week), so a trend means the same on a busy market and a quiet one.
export function isRising(row: { thisWeek: number; lastWeek: number }, totalThisWeek: number): boolean {
  const needed = Math.max(1, Math.ceil(totalThisWeek * 0.1));
  return row.thisWeek >= 2 && row.thisWeek > row.lastWeek && row.thisWeek - row.lastWeek >= needed;
}

/// Requests this week and the week before, and open offers, per category, most
/// requested first. Seed examples and requests dated in the future are left out.
export function weeklyDemand(requests: readonly DemandRequest[], offers: readonly DemandOffer[], now: number): CategoryDemand[] {
  const thisWeek = new Map<CategoryId, number>();
  const lastWeek = new Map<CategoryId, number>();
  for (const r of requests) {
    if (r.seedKey || r.createdAt > now) continue;
    const age = now - r.createdAt;
    if (age >= 2 * WEEK_MS) continue;
    const id = categoryOfRequest(r);
    if (!id) continue;
    const into = age < WEEK_MS ? thisWeek : lastWeek;
    into.set(id, (into.get(id) ?? 0) + 1);
  }
  const open = new Map<CategoryId, number>();
  for (const o of offers) {
    if (o.expiresAt <= now) continue;
    const id = o.category ?? inferCategory(`${o.title} ${o.description}`);
    if (id) open.set(id, (open.get(id) ?? 0) + 1);
  }
  const total = [...thisWeek.values()].reduce((s, n) => s + n, 0);
  return CATEGORY_IDS.map((id) => {
    const row = { thisWeek: thisWeek.get(id) ?? 0, lastWeek: lastWeek.get(id) ?? 0 };
    return { id, name: CATEGORY_NAMES[id], ...row, openOffers: open.get(id) ?? 0, rising: isRising(row, total) };
  })
    .filter((r) => r.thisWeek > 0 || r.lastWeek > 0 || r.openOffers > 0)
    .sort((a, b) => b.thisWeek - a.thisWeek || b.openOffers - a.openOffers || CATEGORY_IDS.indexOf(a.id) - CATEGORY_IDS.indexOf(b.id));
}

export interface DealPrice {
  category: CategoryId;
  priceUsdc: number;
  ts: number;
}

export interface PriceBand {
  low: number;
  mid: number;
  high: number;
  deals: number;
}

/// What Karwan deals in each category settled at over the last 30 days: the
/// lowest, the middle and the highest, shown from three deals.
export function priceBands(deals: readonly DealPrice[], now: number): Partial<Record<CategoryId, PriceBand>> {
  const by = new Map<CategoryId, number[]>();
  for (const d of deals) {
    if (now - d.ts >= BAND_WINDOW_MS || d.ts > now || !(d.priceUsdc > 0)) continue;
    by.set(d.category, [...(by.get(d.category) ?? []), d.priceUsdc]);
  }
  const out: Partial<Record<CategoryId, PriceBand>> = {};
  for (const [id, prices] of by) {
    if (prices.length < BAND_MIN_DEALS) continue;
    const sorted = [...prices].sort((a, b) => a - b);
    const midIndex = Math.floor((sorted.length - 1) / 2);
    out[id] = { low: sorted[0]!, mid: sorted[midIndex]!, high: sorted[sorted.length - 1]!, deals: sorted.length };
  }
  return out;
}
