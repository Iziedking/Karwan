import { and, count, countDistinct, desc, eq, gte, isNotNull, lt, min, or } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { recordReads } from './schema.js';

/// Receipts for paid record reads. The signed detail is kept 24 hours, the
/// receipt for good; a person sees who read their record, never the price.

export interface RecordReadReceipt {
  id: string;
  reader: string;
  subject: string;
  purpose: 'shortlist' | 'bid' | 'question';
  ref: string;
  priceUsdc: number;
  paymentTx: string | null;
  scoreAtRead: number;
  levelAtRead: string;
  detail: unknown | null;
  createdAt: number;
}

export const READ_DETAIL_TTL_MS = 86_400_000;

const mem: RecordReadReceipt[] = [];

const lower = (r: RecordReadReceipt): RecordReadReceipt => ({
  ...r,
  reader: r.reader.toLowerCase(),
  subject: r.subject.toLowerCase(),
});

const fromRow = (row: typeof recordReads.$inferSelect): RecordReadReceipt => ({
  ...row,
  purpose: row.purpose as RecordReadReceipt['purpose'],
  priceUsdc: Number(row.priceUsdc),
});

export async function saveRecordRead(r: RecordReadReceipt): Promise<void> {
  const row = lower(r);
  if (!pgEnabled) {
    if (!mem.some((m) => m.id === row.id)) mem.push(row);
    return;
  }
  await db()
    .insert(recordReads)
    .values({ ...row, priceUsdc: String(row.priceUsdc) })
    .onConflictDoNothing();
}

export async function readersOf(
  subject: string,
  limit = 20,
): Promise<Array<Pick<RecordReadReceipt, 'reader' | 'purpose' | 'createdAt'>>> {
  const s = subject.toLowerCase();
  if (!pgEnabled) {
    return mem
      .filter((r) => r.subject === s)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(({ reader, purpose, createdAt }) => ({ reader, purpose, createdAt }));
  }
  const rows = await db()
    .select({ reader: recordReads.reader, purpose: recordReads.purpose, createdAt: recordReads.createdAt })
    .from(recordReads)
    .where(eq(recordReads.subject, s))
    .orderBy(desc(recordReads.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, purpose: r.purpose as RecordReadReceipt['purpose'] }));
}

export async function recentReadBy(reader: string, subject: string, sinceMs: number): Promise<RecordReadReceipt | null> {
  const [rd, s] = [reader.toLowerCase(), subject.toLowerCase()];
  if (!pgEnabled) {
    return (
      mem
        .filter((r) => r.reader === rd && r.subject === s && r.createdAt >= sinceMs)
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    );
  }
  const [row] = await db()
    .select()
    .from(recordReads)
    .where(and(eq(recordReads.reader, rd), eq(recordReads.subject, s), gte(recordReads.createdAt, sinceMs)))
    .orderBy(desc(recordReads.createdAt))
    .limit(1);
  return row ? fromRow(row) : null;
}

export async function purgeReadDetails(now: number): Promise<number> {
  const cutoff = now - READ_DETAIL_TTL_MS;
  if (!pgEnabled) {
    let n = 0;
    for (const r of mem) {
      if (r.detail !== null && r.createdAt < cutoff) {
        r.detail = null;
        n += 1;
      }
    }
    return n;
  }
  const rows = await db()
    .update(recordReads)
    .set({ detail: null })
    .where(and(isNotNull(recordReads.detail), lt(recordReads.createdAt, cutoff)))
    .returning({ id: recordReads.id });
  return rows.length;
}

export async function deleteReadsFor(address: string): Promise<number> {
  const a = address.toLowerCase();
  if (!pgEnabled) {
    const before = mem.length;
    for (let i = mem.length - 1; i >= 0; i -= 1) {
      if (mem[i]!.reader === a || mem[i]!.subject === a) mem.splice(i, 1);
    }
    return before - mem.length;
  }
  const rows = await db()
    .delete(recordReads)
    .where(or(eq(recordReads.reader, a), eq(recordReads.subject, a)))
    .returning({ id: recordReads.id });
  return rows.length;
}

/// What the public may know about record reads: how many, by how many readers,
/// about how many people, and since the first one. A field reaches the public
/// only by being named here.
export interface RecordReadTotals {
  reads: number;
  readers: number;
  subjects: number;
  since: number | null;
}

export async function recordReadTotals(): Promise<RecordReadTotals> {
  if (!pgEnabled) {
    return {
      reads: mem.length,
      readers: new Set(mem.map((r) => r.reader)).size,
      subjects: new Set(mem.map((r) => r.subject)).size,
      since: mem.length ? Math.min(...mem.map((r) => r.createdAt)) : null,
    };
  }
  const [row] = await db()
    .select({
      reads: count(),
      readers: countDistinct(recordReads.reader),
      subjects: countDistinct(recordReads.subject),
      since: min(recordReads.createdAt),
    })
    .from(recordReads);
  return {
    reads: Number(row?.reads ?? 0),
    readers: Number(row?.readers ?? 0),
    subjects: Number(row?.subjects ?? 0),
    since: row?.since == null ? null : Number(row.since),
  };
}
