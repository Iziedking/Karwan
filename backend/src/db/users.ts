// Users authenticated via email + passkey (Circle login). Web3 users are
// identified solely by their wallet address and don't need a row here. The
// app reads them straight from wagmi on the client and accepts the address
// as authoritative on the server (same trust model as today).
//
// This store maps email -> identity wallet + WebAuthn credential set, so we
// can:
//   * resolve "who is this email" on login
//   * resolve "who owns this passkey" on assertion verification
//   * keep multiple passkeys per user (a phone and a laptop, say)
//
// Persistence model: Postgres is the durable home (accounts must survive a VM
// rebuild), the in-memory store is the synchronous read path every call site
// already uses, and data/users.json stays as a write-through backup that the
// B2 snapshots pick up. Boot calls initUsersStore() to hydrate memory from
// Postgres and one-time-import any file rows Postgres doesn't know yet.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { users as usersTable } from './schema.js';
import { logger } from '../logger.js';

export interface PasskeyCredential {
  /// Base64url-encoded credential ID as returned by the browser. WebAuthn's
  /// `rawId` projected into URL-safe form.
  credentialId: string;
  /// Base64url-encoded public key. Stored as opaque bytes; verifier handles
  /// the decoding when checking assertions.
  publicKey: string;
  /// Signature counter from the authenticator. Verifier increments it on
  /// each successful assertion to detect cloned authenticators.
  counter: number;
  /// Authenticator transports the browser reported (usb, ble, internal, etc).
  /// Optional and informational.
  transports?: string[];
  /// When this credential was registered, epoch ms.
  createdAt: number;
}

export interface KarwanUser {
  /// Lowercased, trimmed email used as the canonical key.
  email: string;
  /// The user's on-chain identity address, a Circle DCW provisioned at
  /// signup. The rest of the app reads this exactly like a wagmi address.
  address: string;
  /// Circle wallet id for the identity wallet. Used by the agent registry
  /// when binding buyer/seller agent wallets back to this user.
  circleIdentityWalletId: string;
  /// One or more passkeys. Adding a second device appends here.
  credentials: PasskeyCredential[];
  createdAt: number;
  updatedAt: number;
}

/// Legacy placeholder credential that early OTP signups persisted by mistake.
/// It is not a real passkey, so it must be ignored when deciding whether a user
/// has passkey sign-in (otherwise OTP-only users read as "passkey active" after
/// a restart, since the in-memory reset was never persisted).
export const OTP_PLACEHOLDER_CREDENTIAL_ID = '__otp_only_placeholder__';

const STORE_PATH = resolve(process.cwd(), 'data', 'users.json');

interface Store {
  byEmail: Record<string, KarwanUser>;
  byAddress: Record<string, string>; // lowercase address -> email
}

let loaded = false;
let store: Store = { byEmail: {}, byAddress: {} };

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  ensureFile();
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Store;
    if (parsed?.byEmail && parsed?.byAddress) {
      store = parsed;
    }
    logger.info({ count: Object.keys(store.byEmail).length }, 'users loaded from disk');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'users load failed, starting empty');
  }
}

function persist(): void {
  try {
    ensureFile();
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'users persist failed');
  }
}

/// Fire-and-forget Postgres upsert for one user. The synchronous call sites
/// can't await; a failed write logs loudly and the file backup still has the
/// row, so nothing is lost silently.
function pgUpsert(user: KarwanUser): void {
  if (!pgEnabled) return;
  void db()
    .insert(usersTable)
    .values({ email: user.email, address: user.address, data: user })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { address: user.address, data: user },
    })
    .catch((err: Error) => {
      logger.error({ err: err.message, email: user.email }, 'users pg upsert FAILED');
    });
}

function pgDelete(email: string): void {
  if (!pgEnabled) return;
  void db()
    .delete(usersTable)
    .where(eq(usersTable.email, email))
    .catch((err: Error) => {
      logger.error({ err: err.message, email }, 'users pg delete FAILED');
    });
}

/// Boot-time hydration. Postgres rows win over file rows (they are newer or
/// equal); file rows Postgres doesn't know are imported once, which migrates
/// an existing users.json without a manual step. Falls back to the file store
/// untouched when Postgres is disabled or unreachable.
export async function initUsersStore(): Promise<void> {
  load();
  if (!pgEnabled) return;
  try {
    const rows = await db().select().from(usersTable);
    const pgEmails = new Set<string>();
    for (const row of rows) {
      const user = row.data;
      pgEmails.add(user.email);
      store.byEmail[user.email] = user;
      store.byAddress[user.address.toLowerCase()] = user.email;
    }
    // One-time import: anything on disk that Postgres doesn't have yet.
    let imported = 0;
    for (const user of Object.values(store.byEmail)) {
      if (!pgEmails.has(user.email)) {
        pgUpsert(user);
        imported += 1;
      }
    }
    persist();
    logger.info(
      { pgRows: rows.length, imported },
      'users store hydrated from postgres',
    );
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      'users pg hydration failed; serving the file store',
    );
  }
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getUserByEmail(email: string): KarwanUser | null {
  load();
  return store.byEmail[normEmail(email)] ?? null;
}

export function getUserByAddress(address: string): KarwanUser | null {
  load();
  const email = store.byAddress[address.toLowerCase()];
  if (!email) return null;
  return store.byEmail[email] ?? null;
}

export function getUserByCredentialId(credentialId: string): KarwanUser | null {
  load();
  for (const user of Object.values(store.byEmail)) {
    if (user.credentials.some((c) => c.credentialId === credentialId)) return user;
  }
  return null;
}

/// Creates the row for a new email-auth user. Caller has already provisioned
/// the Circle identity wallet. Pass `credential` for a passkey signup; omit it
/// for an OTP-only signup (the row starts with zero passkeys and one can be
/// registered later). Never seed a placeholder credential here.
export function createUser(input: {
  email: string;
  address: string;
  circleIdentityWalletId: string;
  credential?: PasskeyCredential;
}): KarwanUser {
  load();
  const email = normEmail(input.email);
  if (store.byEmail[email]) {
    throw new Error(`user with email ${email} already exists`);
  }
  const now = Date.now();
  const user: KarwanUser = {
    email,
    address: input.address.toLowerCase(),
    circleIdentityWalletId: input.circleIdentityWalletId,
    credentials: input.credential ? [input.credential] : [],
    createdAt: now,
    updatedAt: now,
  };
  store.byEmail[email] = user;
  store.byAddress[user.address] = email;
  persist();
  pgUpsert(user);
  return user;
}

/// True when the user has a real passkey, ignoring the legacy OTP placeholder
/// and any empty-publicKey rows. Use this instead of `credentials.length > 0`.
export function hasRealPasskey(user: KarwanUser): boolean {
  return user.credentials.some(
    (c) => c.credentialId !== OTP_PLACEHOLDER_CREDENTIAL_ID && !!c.publicKey,
  );
}

/// Removes a user row entirely (email entry plus the address index). Used by
/// account delete. Returns true when a row existed.
export function deleteUser(address: string): boolean {
  load();
  const addr = address.toLowerCase();
  const email = store.byAddress[addr];
  if (!email) return false;
  delete store.byEmail[email];
  delete store.byAddress[addr];
  persist();
  pgDelete(email);
  return true;
}

export function appendCredential(email: string, credential: PasskeyCredential): KarwanUser {
  load();
  const e = normEmail(email);
  const user = store.byEmail[e];
  if (!user) throw new Error(`no user for ${e}`);
  user.credentials.push(credential);
  user.updatedAt = Date.now();
  persist();
  pgUpsert(user);
  return user;
}

export function bumpCounter(credentialId: string, newCounter: number): void {
  load();
  for (const user of Object.values(store.byEmail)) {
    const cred = user.credentials.find((c) => c.credentialId === credentialId);
    if (cred) {
      cred.counter = newCounter;
      user.updatedAt = Date.now();
      persist();
      pgUpsert(user);
      return;
    }
  }
}
