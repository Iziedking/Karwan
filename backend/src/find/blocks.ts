import { and, eq, or } from 'drizzle-orm';
import { db, pgEnabled } from '../db/client.js';
import { findBlocks } from '../db/schema.js';

/// Who stopped whom (view 72). A block stops deal alerts and pitches both
/// ways and keeps each out of the other's finds. It is never shown to the
/// person blocked.

const mem = new Map<string, number>();
const key = (owner: string, blocked: string) => `${owner}|${blocked}`;

export async function block(owner: string, other: string, now = Date.now()): Promise<void> {
  const o = owner.toLowerCase();
  const b = other.toLowerCase();
  if (o === b) return;
  if (!pgEnabled) {
    mem.set(key(o, b), now);
    return;
  }
  await db().insert(findBlocks).values({ owner: o, blocked: b, at: now }).onConflictDoNothing();
}

export async function unblock(owner: string, other: string): Promise<void> {
  const o = owner.toLowerCase();
  const b = other.toLowerCase();
  if (!pgEnabled) {
    mem.delete(key(o, b));
    return;
  }
  await db().delete(findBlocks).where(and(eq(findBlocks.owner, o), eq(findBlocks.blocked, b)));
}

export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (!pgEnabled) return mem.has(key(x, y)) || mem.has(key(y, x));
  const rows = await db()
    .select({ owner: findBlocks.owner })
    .from(findBlocks)
    .where(or(and(eq(findBlocks.owner, x), eq(findBlocks.blocked, y)), and(eq(findBlocks.owner, y), eq(findBlocks.blocked, x))))
    .limit(1);
  return rows.length > 0;
}

/// Everyone `owner` blocked or was blocked by, for skipping in a find.
export async function blockedSet(owner: string): Promise<Set<string>> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    const out = new Set<string>();
    for (const k of mem.keys()) {
      const [a, b] = k.split('|');
      if (a === o) out.add(b!);
      if (b === o) out.add(a!);
    }
    return out;
  }
  const rows = await db().select().from(findBlocks).where(or(eq(findBlocks.owner, o), eq(findBlocks.blocked, o)));
  return new Set(rows.map((r) => (r.owner === o ? r.blocked : r.owner)));
}

/// For tests only.
export function resetBlocksForTests(): void {
  mem.clear();
}
