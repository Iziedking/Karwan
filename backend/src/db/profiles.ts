import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { profiles } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'profiles.json');

export type Role = 'buyer' | 'seller' | 'both';

export interface UserProfile {
  address: string;
  role: Role;
  displayName: string;
  createdAt: number;
  updatedAt: number;
  seller?: {
    skills: string[];
    bio: string;
    minBudgetUsdc: number;
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
  };
  buyer?: {
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
    bidCollectionSeconds: number;
    milestonePcts: number[];
  };
}

// --- public API: same names as before, now async, Postgres-backed when
// DATABASE_URL is set and flat-file otherwise ---

export async function getProfile(address: string): Promise<UserProfile | null> {
  const key = address.toLowerCase();
  if (pgEnabled) {
    const rows = await db().select().from(profiles).where(eq(profiles.address, key));
    return rows[0]?.data ?? null;
  }
  return loadFile()[key] ?? null;
}

export async function upsertProfile(
  input: Omit<UserProfile, 'createdAt' | 'updatedAt'>,
): Promise<UserProfile> {
  const key = input.address.toLowerCase();
  const existing = await getProfile(key);
  const now = Date.now();
  const next: UserProfile = {
    ...input,
    address: key,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (pgEnabled) {
    await db()
      .insert(profiles)
      .values({ address: key, data: next })
      .onConflictDoUpdate({ target: profiles.address, set: { data: next } });
    return next;
  }
  const store = loadFile();
  store[key] = next;
  saveFile(store);
  return next;
}

export async function listProfiles(): Promise<UserProfile[]> {
  if (pgEnabled) {
    const rows = await db().select().from(profiles);
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile());
}

// --- flat-file fallback ---

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, UserProfile> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, UserProfile>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, UserProfile>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
