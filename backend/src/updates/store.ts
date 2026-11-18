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
import { withNewSeeds, type DealScene, type UpdateCard, type UpdateInput } from './model.js';

const KEY = 'home_updates';
const STORE_PATH = resolve(process.cwd(), 'data', 'home-updates.json');

interface Doc {
  updatedAt: number;
  cards: UpdateCard[];
  /// Every first-run card ever given to this list.
  seeded?: string[];
}

/// First-run cards point only at Karwan's own pages, so nothing links to a post
/// that does not exist yet. Admins swap in Arc House links when they are live.
function seed(now: number): UpdateCard[] {
  const base = { active: true, createdAt: now, updatedAt: now };
  return [
    { ...base, id: 'upd_built_on_arc', order: 0, kind: 'post', tag: 'Tech', title: 'Built on Arc', body: 'A chain made for stablecoins. Fees in USDC, settles in under a second.', ctaLabel: 'How it works', href: '/how-it-works', ground: 'mist', art: 0 },
    { ...base, id: 'upd_paid_in_usdc', order: 1, kind: 'post', tag: 'Tech', title: 'Paid in USDC', body: 'Every deal settles in USDC issued by Circle, held in escrow until release.', ctaLabel: 'Read more', href: '/docs/escrow', ground: 'sage', art: 1 },
    { ...base, id: 'upd_trending', order: 2, kind: 'trending', tag: 'Trending on Karwan', title: 'Most requested this week', body: '', ctaLabel: 'See the market', href: '/market', ground: 'lilac', art: 2 },
    // The ways to deal on Karwan (view 39, 18 Nov): a real photograph each,
    // with the deal drawn over it by the app in the reader's currency.
    ...DEALS.map(([scene, tag, title, body, ctaLabel, href], i) => ({
      ...base, id: `upd_deal_${scene}`, order: 3 + i, kind: 'deal' as const, scene, tag, title, body, ctaLabel, href,
      image: `/updates/deals/${scene}.jpg`, ground: 'paper' as const, art: 0,
    })),
  ];
}

const DEALS: Array<[DealScene, string, string, string, string, string]> = [
  ['open-market', 'Market', 'Every offer is in the open', 'Anyone can read a request and every offer on it: the price, the date and who made it.', 'See the market', '/market'],
  ['direct', 'Ways to deal', 'Trade with someone you know', 'Name their Karwan tag and what will be delivered. The money is held until it arrives.', 'Start a deal', '/buyer?mode=direct'],
  ['contest', 'Ways to deal', 'Run a contest', 'Put up the prize from the start, choose up to eight winners, and each place is paid what you set.', 'Start a contest', '/contests/new'],
  ['hourly', 'Ways to deal', 'Hire by the hour or monthly', 'Set a rate and the most hours a week, for someone you know or posted on the market.', 'Hire someone', '/work/new'],
  ['agent-match', 'Agents', 'Let an agent find the match', 'Say what you need, your budget and your deadline. Agents bring offers that fit, and you choose.', 'Ask an agent', '/buyer'],
  ['standing-order', 'Agents', 'Standing orders', 'Tell your agent once what to find or sell. It asks the right people every day and moves no money.', 'Set one up', '/profile/setup'],
  ['pay-link', 'Money', 'Ask for money with a link', 'Anyone with the link can pay, with or without a Karwan account.', 'Make a link', '/request'],
  ['release', 'Protection', 'Paid when it arrives', 'Karwan holds the money and releases it when the buyer accepts delivery, at once or part by part.', 'How release works', '/docs/escrow'],
];

/// The cards every list had before first-run cards were tracked.
const FIRST_SEEDS = ['upd_built_on_arc', 'upd_paid_in_usdc', 'upd_trending'];

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
  if (!doc) {
    const cards = seed(Date.now());
    doc = { updatedAt: 0, cards, seeded: cards.map((c) => c.id) };
  } else {
    // Cards added to the first-run set since this list was made join it once.
    const merged = withNewSeeds(doc, seed(Date.now()), FIRST_SEEDS);
    if (merged.changed) {
      doc = { updatedAt: Date.now(), ...merged.doc };
      try {
        await save(doc.cards, doc.seeded);
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'updates: could not keep the new first-run cards');
      }
    }
  }
  cache = { at: Date.now(), doc };
  return doc;
}

async function save(cards: UpdateCard[], seeded?: string[]): Promise<void> {
  const doc: Doc = { updatedAt: Date.now(), cards, seeded: seeded ?? cache?.doc.seeded };
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
