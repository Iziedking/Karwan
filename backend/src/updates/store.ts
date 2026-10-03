/// Durable list of home Updates cards: one JSON document in app_snapshots, with
/// a flat-file copy for runs without Postgres. Admin writes are rare, so the
/// whole list is rewritten on each change.

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from '../db/client.js';
import { appSnapshots } from '../db/schema.js';
import { logger } from '../logger.js';
import type { UpdateCard, UpdateInput } from './model.js';

const KEY = 'home_updates';
const STORE_PATH = resolve(process.cwd(), 'data', 'home-updates.json');

interface Doc {
  updatedAt: number;
  cards: UpdateCard[];
}

/// First-run cards point only at Karwan's own pages, so nothing links to a post
/// that does not exist yet. Admins swap in Arc House links when they are live.
function seed(now: number): UpdateCard[] {
  const base = { active: true, createdAt: now, updatedAt: now };
  return [
    { ...base, id: 'upd_built_on_arc', order: 0, kind: 'post', tag: 'Tech', title: 'Built on Arc', body: 'A chain made for stablecoins. Fees in USDC, settles in under a second.', ctaLabel: 'How it works', href: '/how-it-works', ground: 'mist', art: 0 },
    { ...base, id: 'upd_paid_in_usdc', order: 1, kind: 'post', tag: 'Tech', title: 'Paid in USDC', body: 'Every deal settles in USDC issued by Circle, held in escrow until release.', ctaLabel: 'Read more', href: '/docs/escrow', ground: 'sage', art: 1 },
    { ...base, id: 'upd_trending', order: 2, kind: 'trending', tag: 'Trending on Karwan', title: 'Most requested this week', body: '', ctaLabel: 'See the market', href: '/market', ground: 'lilac', art: 2 },
  ];
}

let cache: { at: number; doc: Doc } | null = null;
const CACHE_MS = 30_000;

function readFlat(): Doc | null {
  try {
    if (!existsSync(STORE_PATH)) return null;
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    return parsed && Array.isArray(parsed.cards) ? (parsed as Doc) : null;
  } catch {
    return null;
  }
}

async function load(): Promise<Doc> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.doc;
  let doc: Doc | null = null;
  if (pgEnabled) {
    try {
      const rows = await db().select().from(appSnapshots).where(eq(appSnapshots.key, KEY));
      const data = rows[0]?.data as Doc | undefined;
      if (data && Array.isArray(data.cards)) doc = data;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'updates: pg read failed');
    }
  }
  doc ??= readFlat();
  doc ??= { updatedAt: 0, cards: seed(Date.now()) };
  cache = { at: Date.now(), doc };
  return doc;
}

async function save(cards: UpdateCard[]): Promise<void> {
  const doc: Doc = { updatedAt: Date.now(), cards };
  cache = { at: Date.now(), doc };
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(doc), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'updates: disk write failed');
  }
  if (pgEnabled) {
    await db()
      .insert(appSnapshots)
      .values({ key: KEY, data: doc, updatedAt: doc.updatedAt })
      .onConflictDoUpdate({ target: appSnapshots.key, set: { data: doc, updatedAt: doc.updatedAt } });
  }
}

export async function listUpdates(): Promise<UpdateCard[]> {
  return [...(await load()).cards].sort((a, b) => a.order - b.order);
}

export async function createUpdate(input: UpdateInput): Promise<UpdateCard> {
  const cards = await listUpdates();
  const now = Date.now();
  const card: UpdateCard = { ...input, id: `upd_${randomBytes(6).toString('hex')}`, order: cards.length, createdAt: now, updatedAt: now };
  await save([...cards, card]);
  return card;
}

export async function patchUpdate(id: string, patch: Partial<UpdateInput>): Promise<UpdateCard | null> {
  const cards = await listUpdates();
  const index = cards.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const next = { ...cards[index]!, ...patch, updatedAt: Date.now() };
  cards[index] = next;
  await save(cards);
  return next;
}

export async function deleteUpdate(id: string): Promise<boolean> {
  const cards = await listUpdates();
  const kept = cards.filter((c) => c.id !== id);
  if (kept.length === cards.length) return false;
  await save(kept.map((c, order) => ({ ...c, order })));
  return true;
}

/// Ids not named keep their relative order after the named ones.
export async function reorderUpdates(ids: string[]): Promise<UpdateCard[]> {
  const cards = await listUpdates();
  const rank = new Map(ids.map((id, i) => [id, i]));
  const sorted = [...cards].sort((a, b) => (rank.get(a.id) ?? ids.length + a.order) - (rank.get(b.id) ?? ids.length + b.order));
  const next = sorted.map((c, order) => ({ ...c, order }));
  await save(next);
  return next;
}
