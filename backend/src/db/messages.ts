import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, lt } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { messages } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'messages.json');

export interface ChatMessage {
  id: string;
  jobId: string;
  channel?: 'trade' | 'financing';
  channelKey?: string;
  financingKind?: 'factoring' | 'po';
  financingId?: string;
  sender: string;
  kind?: 'participant' | 'system';
  body: string;
  /// Optional image-only attachment. Raw bytes are kept out of the event
  /// payload in practice by the request size cap; this field is still
  /// validated at the route boundary and expires with the message.
  imageDataUrl?: string;
  replyToId?: string;
  eventType?: string;
  ts: number;
}

export function normalizeChatMessage(message: ChatMessage): ChatMessage {
  const sender = typeof message.sender === 'string' ? message.sender : '';
  const kind = message.kind === 'system' || !sender ? 'system' : 'participant';
  return {
    ...message,
    sender,
    body: typeof message.body === 'string' ? message.body : '',
    ts: Number.isFinite(message.ts) ? message.ts : 0,
    channel: message.channel ?? 'trade',
    channelKey: message.channelKey ?? message.jobId,
    kind,
  };
}

export async function listMessages(jobId: string, channel: 'trade' | 'financing' = 'trade', channelKey = jobId): Promise<ChatMessage[]> {
  if (pgEnabled) {
    const rows = await db().select().from(messages).where(eq(messages.jobId, jobId));
    return rows.map((r) => normalizeChatMessage(r.data)).filter((m) => isChatMessageRetained(m.ts, Date.now()) && m.channel === channel && m.channelKey === channelKey).sort((a, b) => a.ts - b.ts);
  }
  const store = loadFile();
  return Object.values(store)
    .map(normalizeChatMessage)
    .filter((m) => isChatMessageRetained(m.ts, Date.now()) && m.jobId === jobId && m.channel === channel && m.channelKey === channelKey)
    .sort((a, b) => a.ts - b.ts);
}

export const CHAT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export function chatMessageCutoff(now = Date.now()): number {
  return now - CHAT_RETENTION_MS;
}

export function isChatMessageRetained(timestamp: number, now = Date.now()): boolean {
  return Number.isFinite(timestamp) && timestamp >= chatMessageCutoff(now);
}

/// Permanently removes expired chat rows. The read path also filters by the
/// same cutoff so a missed sweep never exposes stale history; this function is
/// the durable deletion pass run by the process retention worker.
export async function deleteMessagesOlderThan(cutoffMs = chatMessageCutoff()): Promise<number> {
  if (pgEnabled) {
    const removed = await db().delete(messages).where(lt(messages.ts, cutoffMs)).returning({ id: messages.id });
    return removed.length;
  }
  const store = loadFile();
  let removed = 0;
  for (const [id, message] of Object.entries(store)) {
    if (message.ts < cutoffMs) {
      delete store[id];
      removed += 1;
    }
  }
  if (removed > 0) saveFile(store);
  return removed;
}

export async function addMessage(message: ChatMessage): Promise<ChatMessage> {
  const next = normalizeChatMessage(message);
  if (pgEnabled) {
    const existing = await db().select().from(messages).where(eq(messages.id, next.id));
    if (existing[0]) return normalizeChatMessage(existing[0].data);
    await db()
      .insert(messages)
      .values({
        id: next.id,
        jobId: next.jobId,
        sender: next.sender,
        ts: next.ts,
        data: next,
      });
    return next;
  }
  const store = loadFile();
  const existing = store[next.id];
  if (existing) return normalizeChatMessage(existing);
  store[next.id] = next;
  saveFile(store);
  return next;
}

export async function getMessage(id: string): Promise<ChatMessage | null> {
  if (pgEnabled) {
    const rows = await db().select().from(messages).where(eq(messages.id, id));
    return rows[0] ? normalizeChatMessage(rows[0].data) : null;
  }
  const message = loadFile()[id];
  return message ? normalizeChatMessage(message) : null;
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, ChatMessage> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, ChatMessage>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, ChatMessage>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
