import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { moneyRailIntents } from './schema.js';
import {
  createMoneyRailIntent,
  type CreateMoneyRailIntentInput,
  type MoneyRailIntent,
} from '../money/railIntent.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'money-rail-intents.json');

interface IntentStore {
  byId: Record<string, MoneyRailIntent>;
  byIdempotencyKey: Record<string, string>;
}

export async function getMoneyRailIntent(id: string): Promise<MoneyRailIntent | null> {
  if (pgEnabled) {
    const rows = await db()
      .select({ data: moneyRailIntents.data })
      .from(moneyRailIntents)
      .where(eq(moneyRailIntents.id, id))
      .limit(1);
    return rows[0]?.data ?? null;
  }
  return loadFile().byId[id] ?? null;
}

export async function getMoneyRailIntentByIdempotencyKey(
  idempotencyKey: string,
): Promise<MoneyRailIntent | null> {
  if (pgEnabled) {
    const rows = await db()
      .select({ data: moneyRailIntents.data })
      .from(moneyRailIntents)
      .where(eq(moneyRailIntents.idempotencyKey, idempotencyKey))
      .limit(1);
    return rows[0]?.data ?? null;
  }
  const id = loadFile().byIdempotencyKey[idempotencyKey];
  return id ? loadFile().byId[id] ?? null : null;
}

export async function ensureMoneyRailIntent(
  input: CreateMoneyRailIntentInput,
): Promise<{ intent: MoneyRailIntent; created: boolean }> {
  const existing = await getMoneyRailIntentByIdempotencyKey(input.idempotencyKey);
  if (existing) return { intent: existing, created: false };
  const intent = createMoneyRailIntent(input);
  if (pgEnabled) {
    try {
      const rows = await db()
        .insert(moneyRailIntents)
        .values(rowFor(intent))
        .onConflictDoNothing({ target: moneyRailIntents.idempotencyKey })
        .returning({ data: moneyRailIntents.data });
      if (rows[0]) return { intent: rows[0].data, created: true };
      const winner = await getMoneyRailIntentByIdempotencyKey(input.idempotencyKey);
      if (winner) return { intent: winner, created: false };
      throw new Error('money rail intent insert did not return a durable row');
    } catch (error) {
      throw error;
    }
  }
  const store = loadFile();
  const winner = store.byIdempotencyKey[input.idempotencyKey];
  if (winner) return { intent: store.byId[winner]!, created: false };
  store.byId[intent.id] = intent;
  store.byIdempotencyKey[intent.idempotencyKey] = intent.id;
  saveFile(store);
  return { intent, created: true };
}

export async function updateMoneyRailIntent(
  id: string,
  mutate: (current: MoneyRailIntent) => MoneyRailIntent,
): Promise<MoneyRailIntent> {
  if (pgEnabled) {
    const current = await getMoneyRailIntent(id);
    if (!current) throw new Error(`money rail intent not found: ${id}`);
    const next = validateMutation(current, mutate(current));
    if (next === current || next.version === current.version) return current;
    const rows = await db()
      .update(moneyRailIntents)
      .set(rowForUpdate(next))
      .where(and(eq(moneyRailIntents.id, id), eq(moneyRailIntents.version, current.version)))
      .returning({ data: moneyRailIntents.data });
    if (!rows[0]) throw new Error(`money rail intent update contention: ${id}`);
    return rows[0].data;
  }
  const store = loadFile();
  const current = store.byId[id];
  if (!current) throw new Error(`money rail intent not found: ${id}`);
  const next = validateMutation(current, mutate(current));
  if (next !== current && next.version !== current.version) {
    store.byId[id] = next;
    saveFile(store);
  }
  return next;
}

export async function listMoneyRailIntentsForOwner(
  owner: string,
  limit = 50,
): Promise<MoneyRailIntent[]> {
  const normalizedOwner = owner.trim().toLowerCase();
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 50));
  if (pgEnabled) {
    const rows = await db()
      .select({ data: moneyRailIntents.data })
      .from(moneyRailIntents)
      .where(eq(moneyRailIntents.owner, normalizedOwner))
      .orderBy(desc(moneyRailIntents.updatedAt))
      .limit(safeLimit);
    return rows.map((row) => row.data);
  }
  return Object.values(loadFile().byId)
    .filter((intent) => intent.owner === normalizedOwner)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, safeLimit);
}

function validateMutation(current: MoneyRailIntent, next: MoneyRailIntent): MoneyRailIntent {
  if (next.id !== current.id) throw new Error('money rail intent id is immutable');
  if (next.idempotencyKey !== current.idempotencyKey) throw new Error('money rail idempotency key is immutable');
  if (next.owner !== current.owner) throw new Error('money rail owner is immutable');
  if (next.rail !== current.rail || next.direction !== current.direction) {
    throw new Error('money rail route is immutable');
  }
  if (next.version < current.version) throw new Error('money rail version cannot move backwards');
  return next;
}

function rowFor(intent: MoneyRailIntent) {
  return {
    id: intent.id,
    idempotencyKey: intent.idempotencyKey,
    owner: intent.owner,
    rail: intent.rail,
    direction: intent.direction,
    status: intent.status,
    version: intent.version,
    updatedAt: intent.updatedAt,
    data: intent,
  };
}

function rowForUpdate(intent: MoneyRailIntent) {
  return {
    status: intent.status,
    version: intent.version,
    updatedAt: intent.updatedAt,
    data: intent,
  };
}

function ensureFile(): void {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify({ byId: {}, byIdempotencyKey: {} }, null, 2), 'utf8');
  }
}

function loadFile(): IntentStore {
  ensureFile();
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Partial<IntentStore>;
    return { byId: parsed.byId ?? {}, byIdempotencyKey: parsed.byIdempotencyKey ?? {} };
  } catch {
    return { byId: {}, byIdempotencyKey: {} };
  }
}

function saveFile(store: IntentStore): void {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
