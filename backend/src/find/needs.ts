import { and, eq } from 'drizzle-orm';
import { db, pgEnabled } from '../db/client.js';
import { standingNeeds } from '../db/schema.js';
import type { DeliveryKind } from '../location/rules.js';
import type { LocalCurrency } from '../rates/usdcRates.js';

/// What a buyer regularly needs, said so sellers' agents can reach them with
/// an offer (view 72): "fresh tomatoes every week for my restaurant". Not a
/// request: nothing is funded and nothing moves until they say interested.

export interface StandingNeed {
  id: string;
  owner: string;
  what: string;
  every: 'once' | 'week' | 'month' | 'season';
  /// A rough budget, in USDC, with the currency they said it in.
  budgetUsdc: string | null;
  currency: LocalCurrency | null;
  kind: DeliveryKind;
  paused: boolean;
  createdAt: number;
}

export const MAX_NEEDS = 10;
export const NEED_TEXT_MAX = 200;

const mem = new Map<string, StandingNeed>();

export class TooManyNeeds extends Error {
  constructor() {
    super(`at most ${MAX_NEEDS} standing needs`);
  }
}

export async function needsOf(owner: string): Promise<StandingNeed[]> {
  const o = owner.toLowerCase();
  if (!pgEnabled) return [...mem.values()].filter((n) => n.owner === o).sort((a, b) => b.createdAt - a.createdAt);
  const rows = await db().select().from(standingNeeds).where(eq(standingNeeds.owner, o));
  return rows.map((r) => r.data as StandingNeed).sort((a, b) => b.createdAt - a.createdAt);
}

/// Saves a new or changed need. A new one past the tenth is refused.
export async function saveNeed(need: StandingNeed): Promise<StandingNeed> {
  const n: StandingNeed = { ...need, owner: need.owner.toLowerCase(), what: need.what.trim().slice(0, NEED_TEXT_MAX) };
  const mine = await needsOf(n.owner);
  if (!mine.some((x) => x.id === n.id) && mine.length >= MAX_NEEDS) throw new TooManyNeeds();
  if (!pgEnabled) {
    mem.set(n.id, n);
    return n;
  }
  await db()
    .insert(standingNeeds)
    .values({ id: n.id, owner: n.owner, paused: n.paused, data: n })
    .onConflictDoUpdate({ target: standingNeeds.id, set: { paused: n.paused, data: n } });
  return n;
}

export async function removeNeed(owner: string, id: string): Promise<boolean> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    const n = mem.get(id);
    if (!n || n.owner !== o) return false;
    mem.delete(id);
    return true;
  }
  const gone = await db().delete(standingNeeds).where(and(eq(standingNeeds.id, id), eq(standingNeeds.owner, o))).returning({ id: standingNeeds.id });
  return gone.length > 0;
}

/// Needs sellers' agents may answer: not paused, of the people given.
export async function liveNeedsOf(owners: readonly string[]): Promise<StandingNeed[]> {
  const set = new Set(owners.map((o) => o.toLowerCase()));
  if (!set.size) return [];
  if (!pgEnabled) return [...mem.values()].filter((n) => set.has(n.owner) && !n.paused);
  const rows = await db().select().from(standingNeeds).where(eq(standingNeeds.paused, false));
  return rows.map((r) => r.data as StandingNeed).filter((n) => set.has(n.owner));
}

/// Every need not paused, for a seller's agent to look through (whose owners
/// let sellers reach them is checked by the reader).
export async function openNeeds(limit = 500): Promise<StandingNeed[]> {
  if (!pgEnabled) return [...mem.values()].filter((n) => !n.paused).slice(0, limit);
  const rows = await db().select().from(standingNeeds).where(eq(standingNeeds.paused, false)).limit(limit);
  return rows.map((r) => r.data as StandingNeed);
}

/// Account deletion.
export async function deleteNeedsOf(owner: string): Promise<void> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    for (const [id, n] of mem) if (n.owner === o) mem.delete(id);
    return;
  }
  await db().delete(standingNeeds).where(eq(standingNeeds.owner, o));
}

/// For tests only.
export function resetNeedsForTests(): void {
  mem.clear();
}
