import { and, eq, gt } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { marketWatches } from './schema.js';
import { logger } from '../logger.js';
import type { MarketWatch } from '../intelligence/watches.js';

/// What people asked their agents to watch (view 48, step 5).

const mem = new Map<string, MarketWatch>();

export async function saveWatch(w: MarketWatch): Promise<void> {
  if (!pgEnabled) {
    mem.set(w.id, w);
    return;
  }
  await db()
    .insert(marketWatches)
    .values({ id: w.id, owner: w.owner, expiresAt: w.expiresAt, data: w })
    .onConflictDoUpdate({ target: marketWatches.id, set: { expiresAt: w.expiresAt, data: w } });
}

/// A person's watches that have not ended.
export async function liveWatchesFor(owner: string, now: number): Promise<MarketWatch[]> {
  const o = owner.toLowerCase();
  if (!pgEnabled) return [...mem.values()].filter((w) => w.owner === o && w.expiresAt > now);
  const rows = await db().select().from(marketWatches).where(and(eq(marketWatches.owner, o), gt(marketWatches.expiresAt, now)));
  return rows.map((r) => r.data as MarketWatch);
}

/// Every watch that has not ended, for the sweep.
export async function allLiveWatches(now: number): Promise<MarketWatch[]> {
  if (!pgEnabled) return [...mem.values()].filter((w) => w.expiresAt > now);
  try {
    const rows = await db().select().from(marketWatches).where(gt(marketWatches.expiresAt, now));
    return rows.map((r) => r.data as MarketWatch);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'market watches load failed');
    return [];
  }
}

/// Stop one of the owner's watches. False when it is not theirs or not found.
export async function stopWatch(owner: string, id: string): Promise<boolean> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    const w = mem.get(id);
    if (!w || w.owner !== o) return false;
    mem.delete(id);
    return true;
  }
  const rows = await db().delete(marketWatches).where(and(eq(marketWatches.id, id), eq(marketWatches.owner, o))).returning({ id: marketWatches.id });
  return rows.length > 0;
}
