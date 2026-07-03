import { listAllBriefs } from '../db/briefs.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';
import { topicalOverlap } from '../llm/keywords.js';
import {
  loadTrendBaseline,
  saveTrendSnapshot,
  pruneTrendSnapshots,
  latestSnapshotTs,
  type KeywordCounts,
} from '../db/trendSnapshots.js';
import { bus, recentEventsByType } from '../events.js';
import { logger } from '../logger.js';

/// Trending-demand nudges (audit/AGENTIC_WORKFLOW_REVIEW.md item 9). A daily pass
/// counts how many recent open requests mention each keyword, diffs that against a
/// ~day-old snapshot, and pings sellers whose profile keywords overlap a rising
/// keyword: "requests for X are up this week, your offer matches." The nudge is
/// the product, not a dashboard — it reuses the buyerHistoryScan matching pattern
/// (topicalOverlap) and rides the same Telegram + in-app feed rails as
/// listing.match.proactive. Gated at the call site by TREND_NUDGES_ENABLED.

/// How far back a request counts as "recent demand". Shorter than the 30-day
/// negotiation-heat window because a nudge is about what is moving THIS WEEK.
const DEMAND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/// A baseline snapshot must be at least this old to diff against, so a run never
/// compares the live counts against a snapshot from the same day.
const MIN_BASELINE_AGE_MS = 20 * 60 * 60 * 1000;
/// Don't write more than one snapshot per this interval, so frequent restarts
/// (each triggering a boot run) can't spam a snapshot per boot.
const MIN_SNAPSHOT_INTERVAL_MS = 20 * 60 * 60 * 1000;
/// Snapshots older than this are pruned.
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/// A keyword is a "riser" only if it gained at least this many recent requests
/// AND has at least this many now — filters day-to-day noise on thin keywords.
const MIN_RISE = 2;
const MIN_CURRENT = 2;
/// Cap the movers we act on so one busy day can't fan out to every keyword.
const MAX_MOVERS = 8;
/// One nudge per seller per this window, even across multiple rising keywords.
const NUDGE_TTL_MS = 72 * 60 * 60 * 1000;
/// Daily cadence. First run fires shortly after boot (seeds the baseline on a
/// fresh deploy; nudges once a day-old baseline exists). Override for tests.
const TICK_MS = Number(process.env.TREND_SCOUT_TICK_MS ?? 24 * 60 * 60 * 1000);
const FIRST_RUN_DELAY_MS = Number(process.env.TREND_SCOUT_FIRST_RUN_DELAY_MS ?? 2 * 60 * 1000);

interface Mover {
  keyword: string;
  count: number;
  delta: number;
}

/// user address -> last nudge ts. Hydrated from event_history on start so the
/// 72h cap holds across restarts (a nudge is durable on the bus).
const lastNudgedAt = new Map<string, number>();

function normKeywords(arr: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      arr
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/// Live per-keyword demand: distinct recent, still-open requests mentioning each
/// keyword. Each request counts once per keyword regardless of repetition.
function currentDemandByKeyword(now: number): KeywordCounts {
  const cutoff = now - DEMAND_WINDOW_MS;
  const counts: KeywordCounts = new Map();
  for (const b of listAllBriefs()) {
    if (b.expiredAt || b.createdAt < cutoff) continue;
    for (const kw of normKeywords(b.keywords ?? [])) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
  }
  return counts;
}

/// The top rising keywords: those that gained the most recent requests over the
/// baseline, above the noise floors, newest-demand first.
function topMovers(current: KeywordCounts, baseline: KeywordCounts): Mover[] {
  const movers: Mover[] = [];
  for (const [keyword, count] of current) {
    if (count < MIN_CURRENT) continue;
    const delta = count - (baseline.get(keyword) ?? 0);
    if (delta < MIN_RISE) continue;
    movers.push({ keyword, count, delta });
  }
  movers.sort((a, b) => b.delta - a.delta || b.count - a.count);
  return movers.slice(0, MAX_MOVERS);
}

async function hydrateDedupe(): Promise<void> {
  try {
    const evts = await recentEventsByType(['trend.match'], 500);
    for (const e of evts) {
      const user = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
      if (user && !lastNudgedAt.has(user)) lastNudgedAt.set(user, e.ts);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'trend nudge dedupe hydrate failed');
  }
}

function pruneDedupe(now: number): void {
  for (const [user, ts] of lastNudgedAt) {
    if (now - ts >= NUDGE_TTL_MS) lastNudgedAt.delete(user);
  }
}

/// Ping every seller whose profile keywords overlap a rising keyword, one nudge
/// per seller per window. Routes to the user's identity address so it lands in
/// their Telegram + personal feed, exactly like the proactive buyer scan.
async function nudgeSellers(movers: Mover[], now: number): Promise<number> {
  pruneDedupe(now);
  const wallets = await listAllAgentWallets();
  let nudged = 0;
  for (const w of wallets) {
    const user = w.userAddress.toLowerCase();
    if (now - (lastNudgedAt.get(user) ?? 0) < NUDGE_TTL_MS) continue;
    const profile = await getProfile(w.userAddress);
    const seller = profile?.seller;
    if (!seller) continue;
    const skillSet = normKeywords([...(seller.skills ?? []), ...(seller.keywords ?? [])]);
    if (skillSet.length === 0) continue;
    // Only movers this seller can actually serve. topicalOverlap strips generic
    // filler, so a rising but generic keyword ("service") matches nobody.
    const matched = movers.filter((m) => topicalOverlap(skillSet, [m.keyword]) > 0);
    if (matched.length === 0) continue;

    lastNudgedAt.set(user, now);
    nudged += 1;
    const top = matched[0]!;
    bus.emitEvent({
      type: 'trend.match',
      actor: 'platform',
      payload: {
        sellerUser: user,
        keyword: top.keyword,
        count: top.count,
        delta: top.delta,
        matchedKeywords: matched.slice(0, 3).map((m) => m.keyword),
        windowDays: Math.round(DEMAND_WINDOW_MS / 86_400_000),
      },
    });
  }
  return nudged;
}

async function runOnce(): Promise<void> {
  const now = Date.now();
  const current = currentDemandByKeyword(now);
  if (current.size === 0) return;

  const baseline = await loadTrendBaseline(now - MIN_BASELINE_AGE_MS);

  // Throttle snapshot writes to roughly one per day so restart-driven boot runs
  // don't bloat the table; the baseline diff still uses the live counts.
  const latest = await latestSnapshotTs();
  if (latest == null || now - latest >= MIN_SNAPSHOT_INTERVAL_MS) {
    await saveTrendSnapshot(now, current);
    await pruneTrendSnapshots(now - SNAPSHOT_RETENTION_MS);
  }

  // No baseline yet (fresh platform / first run) — seed only, nudge next time.
  if (baseline.size === 0) {
    logger.info({ keywords: current.size }, 'trend scout seeded baseline, no nudges yet');
    return;
  }

  const movers = topMovers(current, baseline);
  if (movers.length === 0) {
    logger.info({ keywords: current.size }, 'trend scout: no rising keywords this run');
    return;
  }
  const nudged = await nudgeSellers(movers, now);
  logger.info(
    { movers: movers.map((m) => `${m.keyword}+${m.delta}`), nudged },
    'trend scout nudged sellers on rising demand',
  );
}

/// Start the daily trend scout. Returns a stop function. The first run fires a
/// couple of minutes after boot (once stores have hydrated), then daily.
export function startTrendScout(): () => void {
  let interval: NodeJS.Timeout | null = null;
  const first = setTimeout(() => {
    void hydrateDedupe().then(() =>
      runOnce().catch((err) =>
        logger.error({ err: (err as Error).message }, 'trend scout first run failed'),
      ),
    );
    interval = setInterval(() => {
      runOnce().catch((err) =>
        logger.error({ err: (err as Error).message }, 'trend scout run failed'),
      );
    }, TICK_MS);
  }, FIRST_RUN_DELAY_MS);
  logger.info({ tickMs: TICK_MS, firstRunDelayMs: FIRST_RUN_DELAY_MS }, 'trend scout started');
  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
