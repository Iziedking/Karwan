import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { teamAccessKeys } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'team-access-keys.json');
const scryptAsync = promisify(scrypt);

/// Access keys for the team canon.
///
/// The raw key is shown ONCE at issue and never stored. What is stored is a
/// scrypt hash and a salt, so a dump of this table does not hand anyone the
/// canon.
///
/// The key carries its own record id: `karwan_<id>_<secret>`. That is what makes
/// verification a single lookup rather than a scan. Without it, checking a key
/// would mean scrypt-hashing the candidate against every row, which is slow by
/// design and turns the verify endpoint into a way to burn the server's CPU.
///
/// scrypt rather than argon2 because it ships with Node. One fewer dependency on
/// the path that guards the canon.

export type TeamRole = 'dev' | 'marketing';

export interface TeamAccessKey {
  id: string;
  /// What this key is for, in a human's words. "aisha laptop", "ci".
  label: string;
  member: string;
  role: TeamRole;
  /// scrypt(secret, salt). Never the secret.
  keyHash: string;
  salt: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

/// Public shape. Everything except the material that would let someone forge or
/// brute-force the key.
export interface TeamAccessKeyView {
  id: string;
  label: string;
  member: string;
  role: TeamRole;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  active: boolean;
}

export function toView(key: TeamAccessKey): TeamAccessKeyView {
  return {
    id: key.id,
    label: key.label,
    member: key.member,
    role: key.role,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt ?? null,
    revokedAt: key.revokedAt ?? null,
    active: !key.revokedAt,
  };
}

const KEY_PREFIX = 'karwan';

async function hash(secret: string, salt: string): Promise<string> {
  const derived = (await scryptAsync(secret, salt, 32)) as Buffer;
  return derived.toString('hex');
}

/// Issue a key. Returns the raw value exactly once; it is unrecoverable after
/// this call returns.
export async function issueTeamKey(input: {
  label: string;
  member: string;
  role: TeamRole;
}): Promise<{ key: TeamAccessKey; rawKey: string }> {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const keyHash = await hash(secret, salt);

  const key: TeamAccessKey = {
    id,
    label: input.label,
    member: input.member,
    role: input.role,
    keyHash,
    salt,
    createdAt: Date.now(),
  };

  if (pgEnabled) {
    await db().insert(teamAccessKeys).values({
      id: key.id,
      role: key.role,
      revokedAt: null,
      data: key,
    });
  } else {
    const store = loadFile();
    store[id] = key;
    saveFile(store);
  }

  return { key, rawKey: `${KEY_PREFIX}_${id}_${secret}` };
}

export async function listTeamKeys(): Promise<TeamAccessKeyView[]> {
  const all = pgEnabled
    ? (await db().select().from(teamAccessKeys)).map((r) => r.data)
    : Object.values(loadFile());
  return all.sort((a, b) => b.createdAt - a.createdAt).map(toView);
}

export async function getTeamKey(id: string): Promise<TeamAccessKey | null> {
  if (pgEnabled) {
    const rows = await db().select().from(teamAccessKeys).where(eq(teamAccessKeys.id, id));
    return rows[0]?.data ?? null;
  }
  return loadFile()[id] ?? null;
}

/// Revoke. Idempotent: revoking twice keeps the first timestamp, because that is
/// when access actually ended.
export async function revokeTeamKey(id: string): Promise<TeamAccessKeyView | null> {
  const key = await getTeamKey(id);
  if (!key) return null;
  if (key.revokedAt) return toView(key);

  const next: TeamAccessKey = { ...key, revokedAt: Date.now() };
  await persist(next);
  return toView(next);
}

export interface VerifyResult {
  valid: boolean;
  role?: TeamRole;
  member?: string;
  keyId?: string;
  reason?: 'malformed' | 'unknown' | 'revoked' | 'mismatch';
}

/// Verify a raw key.
///
/// Fails CLOSED on every path. A malformed key, an unknown id, a revoked key and
/// a wrong secret all return `valid: false`, and the caller cannot tell which
/// from the outside beyond the reason we choose to give.
export async function verifyTeamKey(rawKey: string): Promise<VerifyResult> {
  // Split on the FIRST two underscores and take the rest as the secret. Not
  // split('_'): base64url includes '_' in its alphabet, so about half of all
  // issued secrets contain one, and requiring exactly three parts rejected those
  // keys as malformed forever. The id is a UUID and carries no underscore, so
  // the second delimiter is unambiguous whatever the secret looks like.
  const first = rawKey.indexOf('_');
  const second = first < 0 ? -1 : rawKey.indexOf('_', first + 1);
  if (first < 0 || second < 0) return { valid: false, reason: 'malformed' };

  const prefix = rawKey.slice(0, first);
  const id = rawKey.slice(first + 1, second);
  const secret = rawKey.slice(second + 1);
  if (prefix !== KEY_PREFIX || !id || !secret) {
    return { valid: false, reason: 'malformed' };
  }

  const key = await getTeamKey(id);
  if (!key) return { valid: false, reason: 'unknown' };
  if (key.revokedAt) return { valid: false, reason: 'revoked', keyId: id };

  const candidate = await hash(secret, key.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(key.keyHash, 'hex');
  // Constant time, so the comparison does not leak how much of the hash matched.
  // Lengths must match first: timingSafeEqual throws on a mismatch.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'mismatch', keyId: id };
  }

  await persist({ ...key, lastUsedAt: Date.now() });
  return { valid: true, role: key.role, member: key.member, keyId: id };
}

async function persist(key: TeamAccessKey): Promise<void> {
  if (pgEnabled) {
    await db()
      .update(teamAccessKeys)
      .set({ role: key.role, revokedAt: key.revokedAt ?? null, data: key })
      .where(eq(teamAccessKeys.id, key.id));
    return;
  }
  const store = loadFile();
  store[key.id] = key;
  saveFile(store);
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, TeamAccessKey> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, TeamAccessKey>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, TeamAccessKey>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
