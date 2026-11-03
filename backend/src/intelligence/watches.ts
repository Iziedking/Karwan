import type { CategoryId } from '../listings/categories.js';
import type { CategoryDemand, PriceBand } from './marketStore.js';

/// watch_market (view 48, step 5): a standing ask on a person's agent, "tell me
/// when ...", on one market category. Pure: the sweep passes the market as it
/// is now, and each watch remembers what it last saw so it speaks once per
/// change.

export const WATCH_MAX = 5;
export const WATCH_DAYS = 30;
const DAY_MS = 86_400_000;
/// A price watch speaks when the middle of the band moves this much.
const PRICE_MOVE = 0.1;

export type WatchKind = 'requests' | 'price' | 'rising';

export interface MarketWatch {
  id: string;
  owner: string;
  kind: WatchKind;
  category: CategoryId;
  createdAt: number;
  expiresAt: number;
  /// What the watch last saw.
  lastCheckedAt: number;
  seenMid?: number;
  wasRising?: boolean;
}

export type WatchHit =
  | { kind: 'requests'; count: number; jobIds: string[] }
  | { kind: 'price'; fromUsdc: number; toUsdc: number }
  | { kind: 'rising'; requestsThisWeek: number };

export function newWatch(i: { id: string; owner: string; kind: WatchKind; category: CategoryId; now: number }): MarketWatch {
  return { id: i.id, owner: i.owner.toLowerCase(), kind: i.kind, category: i.category, createdAt: i.now, expiresAt: i.now + WATCH_DAYS * DAY_MS, lastCheckedAt: i.now };
}

/// Why a new watch cannot be added, or null when it can.
export function watchRefusal(live: readonly MarketWatch[], category: CategoryId, kind?: WatchKind): string | null {
  if (kind && live.some((w) => w.category === category && w.kind === kind)) return 'You are already watching that.';
  if (live.length >= WATCH_MAX) return 'You can watch up to five things at once. Stop one first.';
  return null;
}

export function checkWatch(
  w: MarketWatch,
  market: { demand: readonly CategoryDemand[]; karwanPrices: Partial<Record<CategoryId, PriceBand>> },
  requests: ReadonlyArray<{ jobId: string; category: CategoryId | null; postedAt: number }>,
  now: number,
): { hit: WatchHit | null; watch: MarketWatch } {
  if (now >= w.expiresAt) return { hit: null, watch: w };
  const next: MarketWatch = { ...w, lastCheckedAt: now };
  if (w.kind === 'requests') {
    const fresh = requests.filter((r) => r.category === w.category && r.postedAt > w.lastCheckedAt && r.postedAt <= now);
    return { hit: fresh.length ? { kind: 'requests', count: fresh.length, jobIds: fresh.map((r) => r.jobId) } : null, watch: next };
  }
  if (w.kind === 'price') {
    const mid = market.karwanPrices[w.category]?.mid;
    if (mid === undefined) return { hit: null, watch: next };
    if (w.seenMid === undefined) return { hit: null, watch: { ...next, seenMid: mid } };
    if (Math.abs(mid - w.seenMid) / w.seenMid < PRICE_MOVE) return { hit: null, watch: next };
    return { hit: { kind: 'price', fromUsdc: w.seenMid, toUsdc: mid }, watch: { ...next, seenMid: mid } };
  }
  const row = market.demand.find((d) => d.id === w.category);
  const rising = !!row?.rising;
  const hit: WatchHit | null = rising && !w.wasRising && row ? { kind: 'rising', requestsThisWeek: row.thisWeek } : null;
  return { hit, watch: { ...next, wasRising: rising } };
}
