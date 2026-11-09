import { and, desc, eq, sql } from 'drizzle-orm';
import { db, pgEnabled } from '../db/client.js';
import { finds } from '../db/schema.js';
import type { DeliveryKind, Where } from '../location/rules.js';
import type { FoundRow } from './rank.js';
import type { LeadRow } from './rankBuyers.js';

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
  /// A seller's find (find_customers): the requests and needs that fit them.
  leads?: LeadRow[];
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

/// Where an alert to one person stands, as the buyer sees it.
export interface AskedView {
  answer: 'interested' | 'not_now' | 'no' | null;
  /// When they are reminded next; null when nothing more goes to them.
  nextAt: number | null;
  closed: boolean;
}

/// What the owner's screen reads: people by name, tag and photo, never a wallet.
export type FindView = Omit<Find, 'owner' | 'rows' | 'leads'> & {
  rows: Array<Omit<FoundRow, 'user' | 'sellerAgent'> & { photo: string | null; asked: AskedView | null }>;
  /// Buyers stay unnamed to a seller: no address, only the need.
  leads?: Array<Omit<LeadRow, 'buyer'> & { pitched: boolean }>;
};

/// `photos` maps a person to their profile photo, read when the page opens;
/// `asked` maps a person to where their deal alert stands.
/// `pitched` holds the needs this seller already pitched from this find.
export function ownerView(
  f: Find,
  photos: ReadonlyMap<string, string> = new Map(),
  asked: ReadonlyMap<string, AskedView> = new Map(),
  pitched: ReadonlySet<string> = new Set(),
): FindView {
  const { owner: _owner, rows, leads, ...rest } = f;
  return {
    ...rest,
    rows: rows.map(({ user, sellerAgent: _a, ...r }) => ({ ...r, photo: photos.get(user.toLowerCase()) ?? null, asked: asked.get(user.toLowerCase()) ?? null })),
    ...(leads ? { leads: leads.map(({ buyer: _b, ...l }) => ({ ...l, pitched: l.kind === 'need' && pitched.has(l.ref) })) } : {}),
  };
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

/// A find by its id alone, for the sweep that sends its alerts.
export async function findById(id: string): Promise<Find | null> {
  if (!pgEnabled) return mem.get(id) ?? null;
  const [r] = await db().select().from(finds).where(eq(finds.id, id)).limit(1);
  return r ? (r.data as Find) : null;
}

/// The find a private request was posted from, if any.
export async function findByJob(jobId: string): Promise<Find | null> {
  const j = jobId.toLowerCase();
  if (!pgEnabled) return [...mem.values()].find((f) => f.jobId?.toLowerCase() === j) ?? null;
  const [r] = await db().select().from(finds).where(sql`lower(${finds.data}->>'jobId') = ${j}`).limit(1);
  return r ? (r.data as Find) : null;
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
