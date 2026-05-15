import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { telegramLinks } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'telegram-links.json');

export interface TelegramLink {
  address: string;
  chatId: number;
  username?: string;
  linkedAt: number;
}

export async function getTelegramLink(address: string): Promise<TelegramLink | null> {
  const key = address.toLowerCase();
  if (pgEnabled) {
    const rows = await db().select().from(telegramLinks).where(eq(telegramLinks.address, key));
    return rows[0]?.data ?? null;
  }
  return loadFile()[key] ?? null;
}

export async function saveTelegramLink(link: TelegramLink): Promise<TelegramLink> {
  const key = link.address.toLowerCase();
  const record: TelegramLink = { ...link, address: key };
  if (pgEnabled) {
    await db()
      .insert(telegramLinks)
      .values({ address: key, data: record })
      .onConflictDoUpdate({ target: telegramLinks.address, set: { data: record } });
    return record;
  }
  const store = loadFile();
  store[key] = record;
  saveFile(store);
  return record;
}

export async function removeTelegramLink(address: string): Promise<void> {
  const key = address.toLowerCase();
  if (pgEnabled) {
    await db().delete(telegramLinks).where(eq(telegramLinks.address, key));
    return;
  }
  const store = loadFile();
  delete store[key];
  saveFile(store);
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, TelegramLink> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, TelegramLink>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, TelegramLink>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
