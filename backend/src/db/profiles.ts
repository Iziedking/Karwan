import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { profiles } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'profiles.json');

export type Role = 'buyer' | 'seller' | 'both';

export type UserLocale = 'en' | 'ar' | 'fr' | 'hi' | 'sw';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettings {
  locale?: UserLocale;
  theme?: ThemePreference;
  soundEnabled?: boolean;
  notificationsMuted?: boolean;
  publicPassport?: boolean;
}

export interface UserProfile {
  address: string;
  role: Role;
  displayName: string;
  createdAt: number;
  updatedAt: number;
  /// X (formerly Twitter) handle without the `@`. When set, key public events
  /// for this user (deal opened, settled) get queued for broadcast on the
  /// Karwan X account tagging this handle. Stored as the handle string only;
  /// no OAuth tokens persist here.
  xHandle?: string;
  /// X user id (stable identifier, doesn't change when the user renames). We
  /// keep it so a handle change on X is detectable on next reconnect.
  xUserId?: string;
  /// The user's X display picture URL. Profile avatars prefer this over the
  /// generated mark when present. Refreshed each time the user re-OAuths.
  xProfileImageUrl?: string;
  /// User preferences. Includes locale (used to localise Telegram + email
  /// notifications backend-side) and other app-wide toggles.
  settings?: UserSettings;
  seller?: {
    skills: string[];
    bio: string;
    minBudgetUsdc: number;
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
    /** Canonical match tags derived from skills+bio on save. Empty if extraction
     *  failed. Seller agent compares these to brief keywords to gate bidding. */
    keywords?: string[];
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

/// The profile that currently owns an X handle (case-insensitive), if any.
/// Used to keep one X handle bound to a single wallet.
export async function findProfileByXHandle(handle: string): Promise<UserProfile | null> {
  const h = handle.replace(/^@/, '').toLowerCase();
  if (!h) return null;
  const all = await listProfiles();
  return all.find((p) => p.xHandle?.toLowerCase() === h) ?? null;
}

/// The profile bound to a stable X user id, if any. Preferred over handle
/// matching since the id survives an X rename.
export async function findProfileByXUserId(id: string): Promise<UserProfile | null> {
  if (!id) return null;
  const all = await listProfiles();
  return all.find((p) => p.xUserId === id) ?? null;
}

/// Removes a user's off-chain profile. Used by account delete. On-chain
/// reputation is permanent and lives elsewhere; this only clears the off-chain
/// record (display name, role, X handle, settings).
export async function deleteProfile(address: string): Promise<void> {
  const key = address.toLowerCase();
  if (pgEnabled) {
    await db().delete(profiles).where(eq(profiles.address, key));
    return;
  }
  const store = loadFile();
  delete store[key];
  saveFile(store);
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
