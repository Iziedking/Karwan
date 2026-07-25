import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { assistantUsage } from './schema.js';
import { logger } from '../logger.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'assistant-usage.json');

/// One row per address holding a rolling day and week counter. Keyed by period
/// label rather than a timestamp window so a rollover is a string comparison
/// and no background sweep is needed: the first request in a new period
/// overwrites the stale count.
export interface AssistantUsage {
  address: string;
  dayKey: string;
  dayCount: number;
  weekKey: string;
  weekCount: number;
  updatedAt: number;
}

/// UTC day, so a cap cannot be reset by changing device timezone.
export function dayKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/// ISO-style week label: the UTC date of the Monday that starts the week.
/// Comparing labels means a week rolls over without any scheduled job.
export function weekKeyOf(now: number): string {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export interface UsageVerdict {
  allowed: boolean;
  /// Which cap rejected the request, for the user-facing message.
  scope?: 'day' | 'week';
  dayRemaining: number;
  weekRemaining: number;
  /// Epoch ms when the blocking window rolls over.
  resetAt?: number;
}

function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function nextUtcMonday(now: number): number {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() + (7 - dow));
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/// Count one assistant message against `address` and report whether it was
/// allowed. Consumes the quota only when the request is within both caps, so a
/// rejected message never eats a slot the user did not get an answer for.
export async function consumeAssistantQuota(
  address: string,
  dayMax: number,
  weekMax: number,
  now = Date.now(),
): Promise<UsageVerdict> {
  const key = address.toLowerCase();
  const dayKey = dayKeyOf(now);
  const weekKey = weekKeyOf(now);

  const current = (await read(key)) ?? {
    address: key,
    dayKey,
    dayCount: 0,
    weekKey,
    weekCount: 0,
    updatedAt: now,
  };

  const dayCount = current.dayKey === dayKey ? current.dayCount : 0;
  const weekCount = current.weekKey === weekKey ? current.weekCount : 0;

  if (dayCount >= dayMax) {
    return {
      allowed: false,
      scope: 'day',
      dayRemaining: 0,
      weekRemaining: Math.max(0, weekMax - weekCount),
      resetAt: nextUtcMidnight(now),
    };
  }
  if (weekCount >= weekMax) {
    return {
      allowed: false,
      scope: 'week',
      dayRemaining: Math.max(0, dayMax - dayCount),
      weekRemaining: 0,
      resetAt: nextUtcMonday(now),
    };
  }

  const next: AssistantUsage = {
    address: key,
    dayKey,
    dayCount: dayCount + 1,
    weekKey,
    weekCount: weekCount + 1,
    updatedAt: now,
  };
  await write(next);

  return {
    allowed: true,
    dayRemaining: Math.max(0, dayMax - next.dayCount),
    weekRemaining: Math.max(0, weekMax - next.weekCount),
  };
}

async function read(address: string): Promise<AssistantUsage | null> {
  if (pgEnabled) {
    try {
      const rows = await db()
        .select()
        .from(assistantUsage)
        .where(eq(assistantUsage.address, address))
        .limit(1);
      return rows[0]?.data ?? null;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'assistant usage read failed');
      return null;
    }
  }
  return loadFile()[address] ?? null;
}

async function write(entry: AssistantUsage): Promise<void> {
  if (pgEnabled) {
    try {
      await db()
        .insert(assistantUsage)
        .values({ address: entry.address, updatedAt: entry.updatedAt, data: entry })
        .onConflictDoUpdate({
          target: assistantUsage.address,
          set: { updatedAt: entry.updatedAt, data: entry },
        });
      return;
    } catch (err) {
      // A counter write that fails must not block the reply. The worst case is
      // one uncounted message, which is far better than a broken assistant.
      logger.warn({ err: (err as Error).message }, 'assistant usage write failed');
      return;
    }
  }
  const store = loadFile();
  store[entry.address] = entry;
  saveFile(store);
}

// --- flat-file fallback ---

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, AssistantUsage> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, AssistantUsage>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, AssistantUsage>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
