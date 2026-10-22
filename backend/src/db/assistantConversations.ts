import { randomUUID } from 'node:crypto';
import { pgEnabled, postgresExecutor } from './client.js';

/// Assistant conversations saved to the account (view 19). Postgres in
/// production; an in-memory map when there is no database. A past confirm
/// card is kept as a record of what was shown: no id, no payload, a status.

export const MAX_MESSAGES = 40;
export const MAX_CONVERSATIONS = 50;
const TITLE_MAX = 60;
const CONTENT_MAX = 8_000;

export type StoredAction = Record<string, unknown> & { status: 'done' | 'expired' };

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: StoredAction[];
}

export interface AssistantConversation {
  id: string;
  address: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

export type ConversationSummary = Pick<AssistantConversation, 'id' | 'title' | 'createdAt' | 'updatedAt'>;

export interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: unknown[];
}

const mem = new Map<string, AssistantConversation>();
const low = (s: string) => s.toLowerCase();
let lastAt = 0;
/// Strictly increasing, so "used longest ago" never ties.
const stamp = () => (lastAt = Math.max(Date.now(), lastAt + 1));

const summary = (c: AssistantConversation): ConversationSummary => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt });

/// Whatever the client sent about a card, it comes back unconfirmable.
function storedAction(raw: unknown): StoredAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id: _id, nonce: _nonce, payload: _payload, status, ...rest } = raw as Record<string, unknown>;
  return { ...rest, status: status === 'done' ? 'done' : 'expired' };
}

function storedMessage(m: IncomingMessage): StoredMessage {
  const actions = (m.actions ?? []).map(storedAction).filter((a): a is StoredAction => a !== null);
  return { role: m.role, content: m.content.slice(0, CONTENT_MAX), ...(actions.length ? { actions } : {}) };
}

function titleOf(messages: readonly StoredMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content ?? messages[0]?.content ?? '';
  return first.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trim();
}

export async function listConversations(address: string): Promise<ConversationSummary[]> {
  const a = low(address);
  if (!pgEnabled) {
    return [...mem.values()].filter((c) => c.address === a).sort((x, y) => y.updatedAt - x.updatedAt).map(summary);
  }
  const res = await postgresExecutor().query<{ data: AssistantConversation }>(
    `SELECT data FROM assistant_conversations_v1 WHERE address = $1 ORDER BY updated_at DESC LIMIT ${MAX_CONVERSATIONS}`,
    [a],
  );
  return res.rows.map((row) => summary(row.data));
}

/// Null when it is missing or belongs to someone else: the two look the same.
export async function getConversation(address: string, id: string): Promise<AssistantConversation | null> {
  const a = low(address);
  if (!pgEnabled) {
    const c = mem.get(id);
    return c && c.address === a ? c : null;
  }
  const res = await postgresExecutor().query<{ data: AssistantConversation }>(
    `SELECT data FROM assistant_conversations_v1 WHERE id = $1 AND address = $2`,
    [id, a],
  );
  return res.rows[0]?.data ?? null;
}

/// Starts a conversation (id null) or adds to one. Throws `not_found` for an
/// id the account does not own.
export async function appendToConversation(address: string, id: string | null, messages: readonly IncomingMessage[]): Promise<AssistantConversation> {
  const a = low(address);
  const current = id ? await getConversation(a, id) : null;
  if (id && !current) throw new Error('not_found');
  const now = stamp();
  const all = [...(current?.messages ?? []), ...messages.map(storedMessage)].slice(-MAX_MESSAGES);
  const next: AssistantConversation = current
    ? { ...current, messages: all, updatedAt: now }
    : { id: randomUUID(), address: a, title: titleOf(all), messages: all, createdAt: now, updatedAt: now };

  if (!pgEnabled) {
    mem.set(next.id, next);
    const mine = [...mem.values()].filter((c) => c.address === a).sort((x, y) => y.updatedAt - x.updatedAt);
    for (const old of mine.slice(MAX_CONVERSATIONS)) mem.delete(old.id);
    return next;
  }
  const pg = postgresExecutor();
  await pg.query(
    `INSERT INTO assistant_conversations_v1 (id, address, updated_at, data) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at, data = EXCLUDED.data
     WHERE assistant_conversations_v1.address = EXCLUDED.address`,
    [next.id, a, next.updatedAt, JSON.stringify(next)],
  );
  await pg.query(
    `DELETE FROM assistant_conversations_v1 WHERE address = $1 AND id NOT IN (
       SELECT id FROM assistant_conversations_v1 WHERE address = $1 ORDER BY updated_at DESC LIMIT ${MAX_CONVERSATIONS})`,
    [a],
  );
  return next;
}

/// For the assistant's recall_conversations: up to 20 conversations whose text
/// contains any of the terms, newest first. Terms are matched as plain text.
export async function conversationsMentioning(address: string, terms: readonly string[]): Promise<AssistantConversation[]> {
  const a = low(address);
  const want = terms.map((t) => t.toLowerCase()).filter(Boolean);
  if (!want.length) return [];
  if (!pgEnabled) {
    return [...mem.values()]
      .filter((c) => c.address === a && want.some((t) => JSON.stringify(c).toLowerCase().includes(t)))
      .sort((x, y) => y.updatedAt - x.updatedAt)
      .slice(0, 20);
  }
  const patterns = want.map((t) => `%${t.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
  const res = await postgresExecutor().query<{ data: AssistantConversation }>(
    `SELECT data FROM assistant_conversations_v1 WHERE address = $1 AND data::text ILIKE ANY($2::text[])
     ORDER BY updated_at DESC LIMIT 20`,
    [a, patterns],
  );
  return res.rows.map((row) => row.data);
}

export async function deleteConversation(address: string, id: string): Promise<boolean> {
  const a = low(address);
  if (!pgEnabled) {
    const c = mem.get(id);
    if (!c || c.address !== a) return false;
    return mem.delete(id);
  }
  const res = await postgresExecutor().query<{ id: string }>(
    `DELETE FROM assistant_conversations_v1 WHERE id = $1 AND address = $2 RETURNING id`,
    [id, a],
  );
  return res.rows.length > 0;
}

/// Account deletion.
export async function deleteConversationsOf(address: string): Promise<void> {
  const a = low(address);
  if (!pgEnabled) {
    for (const [id, c] of mem) if (c.address === a) mem.delete(id);
    return;
  }
  await postgresExecutor().query(`DELETE FROM assistant_conversations_v1 WHERE address = $1`, [a]);
}

export function __resetConversationsForTest(): void {
  mem.clear();
}
