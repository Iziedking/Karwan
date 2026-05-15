import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { messages } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'messages.json');

export interface ChatMessage {
  id: string;
  jobId: string;
  sender: string;
  body: string;
  ts: number;
}

export async function listMessages(jobId: string): Promise<ChatMessage[]> {
  if (pgEnabled) {
    const rows = await db().select().from(messages).where(eq(messages.jobId, jobId));
    return rows.map((r) => r.data).sort((a, b) => a.ts - b.ts);
  }
  const store = loadFile();
  return Object.values(store)
    .filter((m) => m.jobId === jobId)
    .sort((a, b) => a.ts - b.ts);
}

export async function addMessage(message: ChatMessage): Promise<ChatMessage> {
  if (pgEnabled) {
    await db()
      .insert(messages)
      .values({
        id: message.id,
        jobId: message.jobId,
        sender: message.sender,
        ts: message.ts,
        data: message,
      });
    return message;
  }
  const store = loadFile();
  store[message.id] = message;
  saveFile(store);
  return message;
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
