import { db, pgEnabled } from './client.js';
import { trendSnapshots } from './schema.js';
import { sql, eq, lte } from 'drizzle-orm';
import { logger } from '../logger.js';

/// Durable per-keyword demand snapshots for the trend scout. Each run stores how
/// many recent open requests mention each keyword; a later run reads the most
/// recent snapshot that is at least a day old as its baseline and diffs the live
/// counts against it to find rising demand (agents/trendScout.ts).
///
/// Postgres is the store; when it is off (dev) a process-local ring of runs keeps
/// the scout working within a single process (baselines just reset on restart).

export type KeywordCounts = Map<string, number>;

/// No-DB fallback: the last few runs held in memory, newest last.
const memRuns: { ts: number; counts: Record<string, number> }[] = [];
const MEM_RUN_CAP = 40;

/// Timestamp of the most recent stored snapshot run, or null if none. Used to
/// throttle writes so frequent restarts can't spam a snapshot per boot.
export async function latestSnapshotTs(): Promise<number | null> {
  if (!pgEnabled) {
    return memRuns.length ? memRuns[memRuns.length - 1]!.ts : null;
  }
  try {
    const rows = await db()
      .select({ ts: sql<number>`max(${trendSnapshots.ts})` })
      .from(trendSnapshots);
    const ts = rows[0]?.ts;
    return ts == null ? null : Number(ts);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'trend snapshot latest-ts read failed');
    return null;
  }
}

/// The most recent snapshot run at or before `beforeTs`, as a keyword->count map.
/// Empty when no run is old enough yet (the scout then only seeds, no nudges).
export async function loadTrendBaseline(beforeTs: number): Promise<KeywordCounts> {
  if (!pgEnabled) {
    const run = [...memRuns].reverse().find((r) => r.ts <= beforeTs);
    return new Map(Object.entries(run?.counts ?? {}));
  }
  try {
    const pick = await db()
      .select({ ts: sql<number>`max(${trendSnapshots.ts})` })
      .from(trendSnapshots)
      .where(lte(trendSnapshots.ts, beforeTs));
    const baselineTs = pick[0]?.ts;
    if (baselineTs == null) return new Map();
    const rows = await db()
      .select()
      .from(trendSnapshots)
      .where(eq(trendSnapshots.ts, Number(baselineTs)));
    const out: KeywordCounts = new Map();
    for (const r of rows) out.set(r.keyword, Number(r.count));
    return out;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'trend baseline read failed');
    return new Map();
  }
}

/// Persist one run's keyword counts at ts. Best-effort; never throws.
export async function saveTrendSnapshot(ts: number, counts: KeywordCounts): Promise<void> {
  if (counts.size === 0) return;
  if (!pgEnabled) {
    memRuns.push({ ts, counts: Object.fromEntries(counts) });
    while (memRuns.length > MEM_RUN_CAP) memRuns.shift();
    return;
  }
  const rows = [...counts].map(([keyword, count]) => ({ keyword, ts, count }));
  try {
    await db().insert(trendSnapshots).values(rows).onConflictDoNothing();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'trend snapshot write failed');
  }
}

/// Drop snapshots older than `cutoff` so the table stays bounded.
export async function pruneTrendSnapshots(cutoff: number): Promise<void> {
  if (!pgEnabled) {
    for (let i = memRuns.length - 1; i >= 0; i--) {
      if (memRuns[i]!.ts < cutoff) memRuns.splice(i, 1);
    }
    return;
  }
  try {
    await db().delete(trendSnapshots).where(lte(trendSnapshots.ts, cutoff));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'trend snapshot prune failed');
  }
}
