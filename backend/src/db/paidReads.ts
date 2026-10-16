import { min, sql, sum } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { paidReads } from './schema.js';

/// How many x402 reads agents paid for, per endpoint. A count and the time of
/// the first one, nothing else: who read, about whom and what it cost stay out,
/// so the count can be public and can outlive the 24-hour read details.

export type PaidReadEndpoint =
  | 'credit-passport'
  | 'repayment-behavior'
  | 'concentration'
  | 'document-anchors'
  | 'skill-demand'
  | 'record';

export interface PaidReadTotals {
  reads: number;
  since: number | null;
  byEndpoint: Partial<Record<PaidReadEndpoint, number>>;
}

const mem = new Map<string, { endpoint: PaidReadEndpoint; reads: number; firstAt: number }>();

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

export async function countPaidRead(endpoint: PaidReadEndpoint, at: number): Promise<void> {
  const day = dayOf(at);
  if (!pgEnabled) {
    const key = `${endpoint}|${day}`;
    const row = mem.get(key);
    if (row) {
      row.reads += 1;
      row.firstAt = Math.min(row.firstAt, at);
    } else mem.set(key, { endpoint, reads: 1, firstAt: at });
    return;
  }
  await db()
    .insert(paidReads)
    .values({ endpoint, day, reads: 1, firstAt: at })
    .onConflictDoUpdate({
      target: [paidReads.endpoint, paidReads.day],
      set: {
        reads: sql`${paidReads.reads} + 1`,
        firstAt: sql`least(${paidReads.firstAt}, excluded.first_at)`,
      },
    });
}

export async function paidReadTotals(): Promise<PaidReadTotals> {
  const rows = pgEnabled
    ? (
        await db()
          .select({ endpoint: paidReads.endpoint, reads: sum(paidReads.reads), firstAt: min(paidReads.firstAt) })
          .from(paidReads)
          .groupBy(paidReads.endpoint)
      ).map((r) => ({ endpoint: r.endpoint as PaidReadEndpoint, reads: Number(r.reads ?? 0), firstAt: Number(r.firstAt) }))
    : [...mem.values()];
  const byEndpoint: PaidReadTotals['byEndpoint'] = {};
  let reads = 0;
  let since: number | null = null;
  for (const r of rows) {
    byEndpoint[r.endpoint] = (byEndpoint[r.endpoint] ?? 0) + r.reads;
    reads += r.reads;
    since = since === null ? r.firstAt : Math.min(since, r.firstAt);
  }
  return { reads, since, byEndpoint };
}
