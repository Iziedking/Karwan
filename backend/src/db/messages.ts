import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
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
    return rows.map((r) => normalizeChatMessage(r.data)).filter((m) => m.channel === channel && m.channelKey === channelKey).sort((a, b) => a.ts - b.ts);
  }
  const store = loadFile();
  return Object.values(store)
    .map(normalizeChatMessage)
    .filter((m) => m.jobId === jobId && m.channel === channel && m.channelKey === channelKey)
    .sort((a, b) => a.ts - b.ts);
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
