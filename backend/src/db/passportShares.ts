import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { passportShares } from './schema.js';

/// Passport shares (view 29): who may see a person's full record, until when.

export interface PassportShare {
  id: string;
  subject: string;
  viewer: string | null;
  viewerTag: string | null;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  stoppedAt: number | null;
  views: number;
  lastViewedAt: number | null;
}

const mem: PassportShare[] = [];

export async function insertShare(share: PassportShare): Promise<void> {
  const row = { ...share, subject: share.subject.toLowerCase(), viewer: share.viewer?.toLowerCase() ?? null };
  if (!pgEnabled) {
    mem.push(row);
    return;
  }
  await db().insert(passportShares).values(row);
}

/// Shares still open: not stopped and not yet expired, newest first.
export async function liveSharesOf(subject: string, now: number): Promise<PassportShare[]> {
  const s = subject.toLowerCase();
  if (!pgEnabled) {
    return mem.filter((r) => r.subject === s && r.stoppedAt === null && r.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt);
  }
  return db()
    .select()
    .from(passportShares)
    .where(and(eq(passportShares.subject, s), isNull(passportShares.stoppedAt), gt(passportShares.expiresAt, now)))
    .orderBy(desc(passportShares.createdAt));
}

export async function shareByTokenHash(tokenHash: string): Promise<PassportShare | null> {
  if (!pgEnabled) return mem.find((r) => r.tokenHash === tokenHash) ?? null;
  const [row] = await db().select().from(passportShares).where(eq(passportShares.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

/// Stops one of the subject's own shares. False when there is no such share.
export async function stopShare(subject: string, id: string, now: number): Promise<boolean> {
  const s = subject.toLowerCase();
  if (!pgEnabled) {
    const row = mem.find((r) => r.id === id && r.subject === s && r.stoppedAt === null);
    if (!row) return false;
    row.stoppedAt = now;
    return true;
  }
  const rows = await db()
    .update(passportShares)
    .set({ stoppedAt: now })
    .where(and(eq(passportShares.id, id), eq(passportShares.subject, s), isNull(passportShares.stoppedAt)))
    .returning({ id: passportShares.id });
  return rows.length > 0;
}

export async function noteShareView(id: string, now: number): Promise<void> {
  if (!pgEnabled) {
    const row = mem.find((r) => r.id === id);
    if (row) {
      row.views += 1;
      row.lastViewedAt = now;
    }
    return;
  }
  await db()
    .update(passportShares)
    .set({ views: sql`${passportShares.views} + 1`, lastViewedAt: now })
    .where(eq(passportShares.id, id));
}

export function resetPassportSharesForTest(): void {
  mem.length = 0;
}
