import { db, pgEnabled } from './client.js';
import { appSnapshots } from './schema.js';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { logger } from '../logger.js';

/// Durable snapshot of the seller agents' in-flight bids. `activeBids` in
/// agents/seller.ts is the live negotiation state — which auctions the agent is
/// mid-round on — and was purely in-memory, so a restart mid-auction dropped it
/// and the seller could no longer respond to a buyer's counter (the negotiation
/// stalled). This persists the NON-finalized entries so a deploy resumes them
/// (audit/AGENTIC_WORKFLOW_REVIEW.md — persist ActiveBid).
///
/// One snapshot row, not per-bid write-through: active bids are few and mutate
/// in place across multiple return points, so a debounced whole-map snapshot is
/// simpler and correct. Stored versioned in BOTH Postgres (app_snapshots) and a
/// flat file; hydrate picks whichever is fresher, so the synchronous flat-file
/// flush on shutdown (which beats the async PG write to disk before exit) wins
/// over a slightly older PG copy.

const SNAPSHOT_KEY = 'agent_active_bids';
const STORE_PATH = resolve(process.cwd(), 'data', 'active-bids.json');

interface Snapshot {
  updatedAt: number;
  entries: Record<string, unknown>;
}

function writeFlat(snap: Snapshot): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(snap), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'active bids: disk persist failed');
  }
}

function readFlat(): Snapshot | null {
  try {
    if (!existsSync(STORE_PATH)) return null;
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    if (parsed && typeof parsed.updatedAt === 'number' && parsed.entries) return parsed as Snapshot;
  } catch {
    /* corrupt or legacy file -> treat as none */
  }
  return null;
}

/// Persist the current live bids. Flat file synchronously (cheap, the no-DB
/// fallback and the shutdown-safe copy) + Postgres fire-and-forget for VM-rebuild
/// durability. Never throws into the caller.
export async function saveActiveBids(entries: Record<string, unknown>): Promise<void> {
  const snap: Snapshot = { updatedAt: Date.now(), entries };
  writeFlat(snap);
  if (pgEnabled) {
    try {
      await db()
        .insert(appSnapshots)
        .values({ key: SNAPSHOT_KEY, data: snap, updatedAt: snap.updatedAt })
        .onConflictDoUpdate({ target: appSnapshots.key, set: { data: snap, updatedAt: snap.updatedAt } });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'active bids: pg persist failed');
    }
  }
}

/// Synchronous flat-file flush for the shutdown hook (stopFns run sync and the
/// process exits immediately, so an async PG write would be cut off). Hydrate
/// picks the fresher of flat-file vs PG, so this shutdown copy wins.
export function saveActiveBidsSync(entries: Record<string, unknown>): void {
  writeFlat({ updatedAt: Date.now(), entries });
}

/// Load the freshest snapshot (flat-file vs Postgres by updatedAt).
export async function loadActiveBids(): Promise<Record<string, unknown>> {
  const flat = readFlat();
  let pg: Snapshot | null = null;
  if (pgEnabled) {
    try {
      const rows = await db().select().from(appSnapshots).where(eq(appSnapshots.key, SNAPSHOT_KEY));
      const data = rows[0]?.data as Snapshot | undefined;
      if (data && typeof data.updatedAt === 'number' && data.entries) pg = data;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'active bids: pg hydrate failed');
    }
  }
  const best = [flat, pg]
    .filter((s): s is Snapshot => s != null)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return best?.entries ?? {};
}
