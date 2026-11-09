import { and, desc, eq } from 'drizzle-orm';
import { db, pgEnabled } from '../db/client.js';
import { finds } from '../db/schema.js';
import type { DeliveryKind, Where } from '../location/rules.js';
import type { FoundRow } from './rank.js';

/// A person's finds (view 72): what they asked their agent for and who it
/// found. Private to them. A find ends at the request's deadline or after a week.

export interface Find {
  id: string;
  owner: string;
  side: 'buyer' | 'seller';
  mode: 'choose' | 'agree';
  need: string;
  budgetUsdc: string;
  kind: DeliveryKind;
  where: Where;
  /// The private request once people are alerted (Phase 3).
  jobId: string | null;
  needId: string | null;
  rows: FoundRow[];
  status: 'shortlisted' | 'contacting' | 'matched' | 'ended';
  createdAt: number;
  endsAt: number;
}

export const FIND_DAYS = 7;
const DAY_MS = 86_400_000;
const LIST_MAX = 20;

const mem = new Map<string, Find>();

/// A find ends at the request's deadline when sooner, else after a week.
export function findEndsAt(createdAt: number, deadlineMs: number | null): number {
  const week = createdAt + FIND_DAYS * DAY_MS;
  return deadlineMs !== null && deadlineMs > createdAt ? Math.min(deadlineMs, week) : week;
}

/// What the owner reads: an ended find says so whatever was stored.
export function asOf(f: Find, now: number): Find {
  return f.status !== 'ended' && now >= f.endsAt ? { ...f, status: 'ended' } : f;
}

/// What the owner's screen reads: people by name and tag, never a wallet.
export type FindView = Omit<Find, 'owner' | 'rows'> & { rows: Array<Omit<FoundRow, 'user' | 'sellerAgent'>> };

export function ownerView(f: Find): FindView {
  const { owner: _owner, rows, ...rest } = f;
  return { ...rest, rows: rows.map(({ user: _u, sellerAgent: _a, ...r }) => r) };
}

export async function saveFind(f: Find): Promise<Find> {
  const row: Find = { ...f, owner: f.owner.toLowerCase() };
  if (!pgEnabled) {
    mem.set(row.id, row);
    return row;
  }
  await db()
    .insert(finds)
    .values({ id: row.id, owner: row.owner, createdAt: row.createdAt, data: row })
    .onConflictDoUpdate({ target: finds.id, set: { data: row } });
  return row;
}

/// One find, only for its owner: anyone else gets nothing.
export async function findOf(owner: string, id: string, now = Date.now()): Promise<Find | null> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    const f = mem.get(id);
    return f && f.owner === o ? asOf(f, now) : null;
  }
  const [r] = await db().select().from(finds).where(and(eq(finds.id, id), eq(finds.owner, o))).limit(1);
  return r ? asOf(r.data as Find, now) : null;
}

/// Newest first.
export async function myFinds(owner: string, now = Date.now()): Promise<Find[]> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    return [...mem.values()].filter((f) => f.owner === o).sort((a, b) => b.createdAt - a.createdAt).slice(0, LIST_MAX).map((f) => asOf(f, now));
  }
  const rows = await db().select().from(finds).where(eq(finds.owner, o)).orderBy(desc(finds.createdAt)).limit(LIST_MAX);
  return rows.map((r) => asOf(r.data as Find, now));
}

export async function deleteFindsOf(owner: string): Promise<void> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    for (const [id, f] of mem) if (f.owner === o) mem.delete(id);
    return;
  }
  await db().delete(finds).where(eq(finds.owner, o));
}

/// For tests only.
export function resetFindsForTests(): void {
  mem.clear();
}
