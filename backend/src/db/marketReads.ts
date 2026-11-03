import { gte } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { marketReads } from './schema.js';
import { logger } from '../logger.js';
import type { MarketRead } from '../x402/externalClient.js';

/// Paid web research, kept so a restart does not lose what the agents already
/// paid for (view 48, step 4). One row per keyword set, the newest read wins.

const mem = new Map<string, MarketRead>();

export async function saveMarketRead(key: string, read: MarketRead): Promise<void> {
  if (!pgEnabled) {
    mem.set(key, read);
    return;
  }
  try {
    await db()
      .insert(marketReads)
      .values({ key, researchedAt: read.researchedAt, data: read })
      .onConflictDoUpdate({ target: marketReads.key, set: { researchedAt: read.researchedAt, data: read } });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'market read persist failed');
  }
}

/// Reads researched since `sinceMs`, keyed as they were saved.
export async function marketReadsSince(sinceMs: number): Promise<Array<[string, MarketRead]>> {
  if (!pgEnabled) return [...mem.entries()].filter(([, r]) => r.researchedAt >= sinceMs);
  try {
    const rows = await db().select().from(marketReads).where(gte(marketReads.researchedAt, sinceMs));
    return rows.map((r) => [r.key, r.data as MarketRead]);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'market reads load failed');
    return [];
  }
}
