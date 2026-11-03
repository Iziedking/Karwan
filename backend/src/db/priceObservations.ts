import { db, pgEnabled } from './client.js';
import { priceObservations } from './schema.js';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { inferCategory, type CategoryId } from '../listings/categories.js';
import type { DealPrice } from '../intelligence/marketStore.js';

/// Category-bucketed price history of REAL Karwan deals — the durable, keyword-
/// scoped replacement for the old single global in-memory ring (signals.ts),
/// which lumped every category together so a $200 logo and a $5000 audit shared
/// one median (audit/AGENTIC_WORKFLOW_REVIEW.md, signals price ring).
///
/// Shape mirrors the other durable stores (db/users.ts): the in-memory rings ARE
/// the read path (median/MAD are computed from them, no per-call SQL); Postgres
/// is the durability mirror, written fire-and-forget and hydrated on boot. When
/// Postgres is disabled the rings are process-local and simply reset on restart.

/// One observation: the settled/matched price of a deal, tagged with its
/// normalized keyword bucket and a coarse size band.
export interface PriceObservation {
  jobId: string;
  bucket: string;
  priceUsdc: number;
  sizeBand: 'small' | 'medium' | 'large';
  ts: number;
}

/// Per-bucket ring, capped so a hot category can't grow unbounded in memory.
const RING_CAP = 300;
/// Observations older than this don't count toward the median (they still sit in
/// the ring until evicted by cap, but are filtered at compute time).
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/// Exponential decay half-life: a 30-day-old deal counts half as much as a fresh
/// one, so the median tracks the current market rather than ancient prints.
const DECAY_HALF_LIFE_MS = WINDOW_MS;
/// Computed stats are cached per bucket for this long to keep the hot negotiation
/// path free of repeated median passes.
const STATS_TTL_MS = 5 * 60 * 1000; // 5 min
const MIN_SNAPSHOT_SAMPLES = 4;
const MIN_ANOMALY_SAMPLES = 8;

const rings = new Map<string, { priceUsdc: number; ts: number }[]>();
const statsCache = new Map<string, { stats: BucketStats | null; computedAt: number }>();

interface BucketStats {
  median: number;
  mad: number;
  sampleCount: number;
}

/// The bucket a deal's price goes in: its market category when its words name
/// one (view 48, step 4), else the normalised keyword set as before. Keyword
/// sets alone gave almost every deal its own bucket, so no median ever formed.
export function priceBucket(keywords: string[]): string {
  const words = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].sort();
  const category = inferCategory(words.join(' '));
  return category ? `cat:${category}` : words.join('|');
}

/// A bucket stored before categories, read back into its category.
export function rebucket(stored: string): string {
  return stored.startsWith('cat:') ? stored : priceBucket(stored.split('|'));
}

/// Every recent deal price that has a category, for the market store's bands.
export function allDealPrices(): DealPrice[] {
  const out: DealPrice[] = [];
  for (const [bucket, ring] of rings) {
    if (!bucket.startsWith('cat:')) continue;
    const category = bucket.slice(4) as CategoryId;
    for (const o of ring) out.push({ category, priceUsdc: o.priceUsdc, ts: o.ts });
  }
  return out;
}

function sizeBandFor(priceUsdc: number): 'small' | 'medium' | 'large' {
  if (priceUsdc < 200) return 'small';
  if (priceUsdc < 1000) return 'medium';
  return 'large';
}

/// Decay-weighted median over the in-window observations. Weight halves every
/// DECAY_HALF_LIFE_MS. Weighted median = the value where cumulative weight first
/// reaches half the total weight (sorted by value).
function weightedMedian(obs: { priceUsdc: number; ts: number }[], now: number): number {
  const weighted = obs
    .map((o) => ({ v: o.priceUsdc, w: Math.pow(0.5, (now - o.ts) / DECAY_HALF_LIFE_MS) }))
    .sort((a, b) => a.v - b.v);
  const total = weighted.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return 0;
  let cum = 0;
  for (const x of weighted) {
    cum += x.w;
    if (cum >= total / 2) return x.v;
  }
  return weighted[weighted.length - 1]!.v;
}

function computeStats(bucket: string, now: number): BucketStats | null {
  const ring = rings.get(bucket);
  if (!ring) return null;
  const inWindow = ring.filter((o) => now - o.ts < WINDOW_MS);
  if (inWindow.length < MIN_SNAPSHOT_SAMPLES) return null;
  const median = weightedMedian(inWindow, now);
  const deviations = inWindow.map((o) => ({ priceUsdc: Math.abs(o.priceUsdc - median), ts: o.ts }));
  const mad = weightedMedian(deviations, now);
  return { median, mad, sampleCount: inWindow.length };
}

function statsFor(bucket: string): BucketStats | null {
  if (!bucket) return null;
  const now = Date.now();
  const cached = statsCache.get(bucket);
  if (cached && now - cached.computedAt < STATS_TTL_MS) return cached.stats;
  const stats = computeStats(bucket, now);
  statsCache.set(bucket, { stats, computedAt: now });
  return stats;
}

function pushToRing(bucket: string, priceUsdc: number, ts: number) {
  let ring = rings.get(bucket);
  if (!ring) {
    ring = [];
    rings.set(bucket, ring);
  }
  ring.push({ priceUsdc, ts });
  if (ring.length > RING_CAP) ring.shift();
  statsCache.delete(bucket); // invalidate; recomputed lazily on next read
}

/// Record a real deal's price into its category bucket. Called at deal formation
/// (the matched price of an actual deal). In-memory first (the read path), then
/// a fire-and-forget Postgres upsert keyed by jobId (idempotent — re-recording
/// the same deal overwrites). Never throws into the caller.
export function recordDealPrice(input: {
  jobId: string;
  keywords: string[];
  priceUsdc: number;
  ts: number;
}): void {
  if (!Number.isFinite(input.priceUsdc) || input.priceUsdc <= 0) return;
  const bucket = priceBucket(input.keywords);
  if (!bucket) return;
  pushToRing(bucket, input.priceUsdc, input.ts);
  if (pgEnabled) {
    const priceMicros = Math.round(input.priceUsdc * 1e6);
    const sizeBand = sizeBandFor(input.priceUsdc);
    void db()
      .insert(priceObservations)
      .values({ jobId: input.jobId, bucket, priceMicros, sizeBand, ts: input.ts })
      .onConflictDoUpdate({
        target: priceObservations.jobId,
        set: { bucket, priceMicros, sizeBand, ts: input.ts },
      })
      .catch((err) => logger.warn({ err: (err as Error).message }, 'price observation upsert failed'));
  }
}

/// Median + sample count of recent deals in this category, for the negotiation
/// prompt's market-median line. Null until the bucket has enough samples — the
/// caller falls back to the global ring.
export function categoryPriceSnapshot(keywords: string[]): { median: number; sampleCount: number } | null {
  const stats = statsFor(priceBucket(keywords));
  if (!stats) return null;
  return { median: stats.median, sampleCount: stats.sampleCount };
}

/// How many decay-weighted MADs a price sits from the category median. Null when
/// the bucket is too thin (caller falls back to the global anomaly score). MAD
/// (not stddev) so a single outlier deal doesn't poison the scale.
export function categoryPriceAnomaly(priceUsdc: number, keywords: string[]): number | null {
  const stats = statsFor(priceBucket(keywords));
  if (!stats || stats.sampleCount < MIN_ANOMALY_SAMPLES || stats.mad === 0) return null;
  return (priceUsdc - stats.median) / (1.4826 * stats.mad);
}

/// Hydrate the in-memory rings from Postgres at boot (last 30 days), so category
/// medians survive a restart instead of rebuilding from zero. Best-effort.
export async function initPriceObservationsStore(): Promise<void> {
  if (!pgEnabled) return;
  try {
    const cutoff = Date.now() - WINDOW_MS;
    const rows = await db()
      .select()
      .from(priceObservations)
      .where(sql`${priceObservations.ts} >= ${cutoff}`);
    for (const r of rows) {
      pushToRing(rebucket(r.bucket), r.priceMicros / 1e6, r.ts);
    }
    logger.info({ buckets: rings.size, rows: rows.length }, 'price observations hydrated from Postgres');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'price observations hydrate failed (non-fatal)');
  }
}
