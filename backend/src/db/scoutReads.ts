import { db, pgEnabled } from './client.js';
import { scoutReads } from './schema.js';
import { desc, eq } from 'drizzle-orm';
import { logger } from '../logger.js';
import type { MarketRead } from '../x402/externalClient.js';

/// Persistence for user-triggered market scout reads. Low volume (rate-limited
/// per user), so this reads straight from Postgres rather than keeping an
/// in-memory mirror; a process-local map is the no-DB fallback.

export interface ScoutRead {
  id: string;
  owner: string;
  ts: number;
  read: MarketRead;
}

const memByOwner = new Map<string, ScoutRead[]>();
const MEM_CAP = 20;

export async function saveScoutRead(entry: ScoutRead): Promise<void> {
  const owner = entry.owner.toLowerCase();
  if (!pgEnabled) {
    const arr = memByOwner.get(owner) ?? [];
    arr.unshift({ ...entry, owner });
    memByOwner.set(owner, arr.slice(0, MEM_CAP));
    return;
  }
  try {
    await db()
      .insert(scoutReads)
      .values({ id: entry.id, owner, ts: entry.ts, data: entry.read })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'scout read persist failed');
  }
}

export async function recentScoutReads(owner: string, limit = 10): Promise<ScoutRead[]> {
  const o = owner.toLowerCase();
  if (!pgEnabled) return (memByOwner.get(o) ?? []).slice(0, limit);
  try {
    const rows = await db()
      .select()
      .from(scoutReads)
      .where(eq(scoutReads.owner, o))
      .orderBy(desc(scoutReads.ts))
      .limit(limit);
    return rows.map((r) => ({ id: r.id, owner: r.owner, ts: Number(r.ts), read: r.data as MarketRead }));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'scout read list failed');
    return [];
  }
}
