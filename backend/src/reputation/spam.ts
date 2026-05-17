/// Spam + griefing detector for the reputation engine. Three rolling 7-day
/// signals feed `spamScore`, plus a 90-day `counterAbandonRate`. Numbers are
/// summed with the weights in config and clamped before reaching the engine.
/// All math lives in this file so the engine stays a pure compose function.
///
/// Signals (docs/reputation-model.md §4):
///   1. burst rate         — > N posts (deals + listings + briefs) in 24h
///   2. counterparty diversity — uniqueCounterparties / dealsLast7d
///   3. match-and-cancel   — cancels within 1h of creation / matchesLast7d
///
/// counterAbandonRate (§2.5) is computed separately because it uses a
/// 90-day window rather than 7-day.

import { listAllDeals } from '../db/deals.js';
import { listAllListings } from '../db/listings.js';
import { listAllBriefs } from '../db/briefs.js';
import { repConfig } from './config.js';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DAY_WINDOW = MS_PER_DAY;
const SEVEN_DAY_WINDOW = 7 * MS_PER_DAY;
const NINETY_DAY_WINDOW = 90 * MS_PER_DAY;
const CACHE_TTL_MS = 20_000;

export interface SpamBreakdown {
  burst: number;            // contribution from burst rate, in [0, 0.40]
  diversity: number;        // contribution from low counterparty diversity, in [0, 0.30]
  matchAndCancel: number;   // contribution from rapid cancels, in [0, 0.30]
}

export interface SpamSignals {
  spamScore: number;        // sum of breakdown, clamped to [0, 1]
  breakdown: SpamBreakdown;
  counterAbandonRate: number; // [0, 1], 90-day window
}

interface CacheEntry {
  value: SpamSignals;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

/// Compute all spam signals for one address. Cached per-address with a short
/// TTL so the reputation engine + UI sharing the same render don't recompute
/// from scratch on every read.
export async function computeSpamSignals(addressRaw: string): Promise<SpamSignals> {
  const address = addressRaw.toLowerCase();
  const cached = cache.get(address);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const now = Date.now();
  const [deals, listings, briefs] = await Promise.all([
    safeAll(listAllDeals),
    Promise.resolve(safeSync(listAllListings)),
    Promise.resolve(safeSync(listAllBriefs)),
  ]);

  const burst = burstScore({ address, now, deals, listings, briefs });
  const diversity = diversityScore({ address, now, deals });
  const matchAndCancel = matchAndCancelScore({ address, now, deals });
  const counterAbandonRate = counterAbandonScore({ address, now, deals });

  const total = clamp01(burst + diversity + matchAndCancel);
  const out: SpamSignals = {
    spamScore: total,
    breakdown: { burst, diversity, matchAndCancel },
    counterAbandonRate,
  };
  cache.set(address, { value: out, expiresAt: now + CACHE_TTL_MS });
  return out;
}

/* ============================================================================
   1. BURST RATE
   ============================================================================ */

function burstScore({
  address,
  now,
  deals,
  listings,
  briefs,
}: {
  address: string;
  now: number;
  deals: Array<{ buyer?: string; seller?: string; createdAt?: number }>;
  listings: Array<{ sellerUser?: string; postedAt?: number }>;
  briefs: Array<{ postedBy?: string; createdAt?: number }>;
}): number {
  const cutoff = now - DAY_WINDOW;
  let posts = 0;
  for (const d of deals) {
    if ((d.createdAt ?? 0) < cutoff) continue;
    if (d.buyer?.toLowerCase() === address) posts += 1;
  }
  for (const l of listings) {
    if ((l.postedAt ?? 0) < cutoff) continue;
    if (l.sellerUser?.toLowerCase() === address) posts += 1;
  }
  for (const b of briefs) {
    if ((b.createdAt ?? 0) < cutoff) continue;
    if (b.postedBy?.toLowerCase() === address) posts += 1;
  }

  const limit = Math.max(1, repConfig.spamBurstLimit);
  if (posts <= limit) return 0;
  // Each extra post past the limit adds 0.05, capped at 0.40 per spec.
  const extras = posts - limit;
  return Math.min(0.4, extras * 0.05);
}

/* ============================================================================
   2. COUNTERPARTY DIVERSITY
   Adds 0.30 × (1 - uniqueCounterparties / dealsLast7d) when fewer than ~3
   unique counterparties dominate a busy 7-day window. Returns 0 for users
   with little or balanced activity.
   ========================================================================== */

function diversityScore({
  address,
  now,
  deals,
}: {
  address: string;
  now: number;
  deals: Array<{ buyer?: string; seller?: string; createdAt?: number }>;
}): number {
  const cutoff = now - SEVEN_DAY_WINDOW;
  const counterparties = new Set<string>();
  let total = 0;
  for (const d of deals) {
    if ((d.createdAt ?? 0) < cutoff) continue;
    const buyer = d.buyer?.toLowerCase();
    const seller = d.seller?.toLowerCase();
    let other: string | undefined;
    if (buyer === address) other = seller;
    else if (seller === address) other = buyer;
    if (!other) continue;
    total += 1;
    counterparties.add(other);
  }
  // Need a meaningful sample size before low diversity counts as suspicious.
  // Below 4 deals in 7 days, leave the signal alone.
  if (total < 4) return 0;
  const ratio = counterparties.size / total;
  return Math.max(0, 0.3 * (1 - ratio));
}

/* ============================================================================
   3. MATCH-AND-CANCEL
   Deals created and cancelled within 1 hour of creation are the canonical
   griefing pattern. Rate > 20% adds 0.30 × cancelRate.
   ========================================================================== */

function matchAndCancelScore({
  address,
  now,
  deals,
}: {
  address: string;
  now: number;
  deals: Array<{
    buyer?: string;
    seller?: string;
    createdAt?: number;
    cancelledAt?: number;
  }>;
}): number {
  const cutoff = now - SEVEN_DAY_WINDOW;
  let total = 0;
  let rapidCancels = 0;
  for (const d of deals) {
    const created = d.createdAt ?? 0;
    if (created < cutoff) continue;
    const buyer = d.buyer?.toLowerCase();
    const seller = d.seller?.toLowerCase();
    if (buyer !== address && seller !== address) continue;
    total += 1;
    if (d.cancelledAt && d.cancelledAt - created <= MS_PER_HOUR) rapidCancels += 1;
  }
  if (total === 0) return 0;
  const rate = rapidCancels / total;
  if (rate < 0.2) return 0; // below threshold, ignore
  return Math.min(0.3, 0.3 * rate);
}

/* ============================================================================
   COUNTER-ABANDON RATE (90 days)
   Buyers/sellers who receive counter offers and never accept them are
   wasting platform attention. Rate computed as: cancelled-or-expired deals
   that received at least one counter / total deals that received counters.
   The DirectDeal store doesn't track counter receipts explicitly today, so
   we approximate using the existing fields: any cancellation kind other
   than 'mutual' or 'pre-accept' that happened after acceptedAt counts as
   an abandon when the deal previously had movement (accepted + cancelled).
   When the counter audit lands this becomes exact.
   ========================================================================== */

function counterAbandonScore({
  address,
  now,
  deals,
}: {
  address: string;
  now: number;
  deals: Array<{
    buyer?: string;
    seller?: string;
    createdAt?: number;
    acceptedAt?: number;
    cancelledAt?: number;
    cancelKind?: string;
  }>;
}): number {
  const cutoff = now - NINETY_DAY_WINDOW;
  let touched = 0;     // deals where this party participated past acceptance
  let abandoned = 0;   // deals they accepted then walked away from
  for (const d of deals) {
    const created = d.createdAt ?? 0;
    if (created < cutoff) continue;
    const buyer = d.buyer?.toLowerCase();
    const seller = d.seller?.toLowerCase();
    if (buyer !== address && seller !== address) continue;
    if (!d.acceptedAt) continue;
    touched += 1;
    const adversarialCancel =
      d.cancelledAt &&
      d.cancelKind !== 'mutual' &&
      d.cancelKind !== 'pre-accept' &&
      d.cancelKind !== 'platform-attributed';
    if (adversarialCancel) abandoned += 1;
  }
  if (touched === 0) return 0;
  return clamp01(abandoned / touched);
}

/* ============================================================================
   helpers
   ========================================================================== */

async function safeAll<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

function safeSync<T>(fn: () => T[]): T[] {
  try {
    return fn();
  } catch {
    return [];
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
