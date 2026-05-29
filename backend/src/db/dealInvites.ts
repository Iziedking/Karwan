import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'deal-invites.json');

/// Pending share-link invite for a direct deal. Lives until the recipient
/// claims the link (binds their identity to the deal) or the invite expires.
/// Storage stays flat-file because invites are short-lived (default 7 days)
/// and rarely contended; PG mirror can come later if volume warrants.
export interface DealInvite {
  /// 64-char hex (32 bytes). Used as the path token in /invite/[token].
  token: string;
  jobId: string;
  /// Which side the recipient fills in. Today buyers create the deal so most
  /// invites are role='seller'. Inbound (someone asks a counterparty to pay
  /// them) will use role='buyer'. Both directions share this shape.
  role: 'buyer' | 'seller';
  /// The email the invite was issued to. Recipient must verify ownership via
  /// the standard OTP route before claim is allowed. Stored lower-cased.
  email: string;
  expiresAt: number;
  /// One-shot. Set when the recipient claims and the deal is bound. Later
  /// visits to /invite/[token] just redirect to /deals/[jobId].
  usedAt?: number;
  usedByAddress?: string;
  createdAt: number;
}

const store = new Map<string, DealInvite>();
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const obj = JSON.parse(raw) as Record<string, DealInvite>;
    for (const [k, v] of Object.entries(obj)) store.set(k, v);
    logger.info({ count: store.size }, 'deal invites loaded from disk');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'deal invites load failed, starting empty');
  }
}

function persist(): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj: Record<string, DealInvite> = {};
    for (const [k, v] of store.entries()) obj[k] = v;
    writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'deal invites persist failed');
  }
}

export function createInvite(input: Omit<DealInvite, 'createdAt'>): DealInvite {
  load();
  const invite: DealInvite = {
    ...input,
    email: input.email.toLowerCase(),
    createdAt: Date.now(),
  };
  store.set(invite.token, invite);
  persist();
  return invite;
}

export function getInvite(token: string): DealInvite | null {
  load();
  return store.get(token) ?? null;
}

export function getInviteByJob(jobId: string): DealInvite | null {
  load();
  for (const inv of store.values()) {
    if (inv.jobId.toLowerCase() === jobId.toLowerCase() && !inv.usedAt) return inv;
  }
  return null;
}

export function markInviteUsed(token: string, address: string): DealInvite | null {
  load();
  const inv = store.get(token);
  if (!inv) return null;
  inv.usedAt = Date.now();
  inv.usedByAddress = address.toLowerCase();
  store.set(inv.token, inv);
  persist();
  return inv;
}

/// Garbage-collect expired + claimed invites older than 30 days. Called on
/// boot and on every getInvite when the store is large; cheap enough to skip
/// a scheduled job for the testnet footprint.
export function pruneStale(): number {
  load();
  const now = Date.now();
  const cutoff = now - 30 * 86_400_000;
  let removed = 0;
  for (const [k, v] of store.entries()) {
    if ((v.usedAt && v.usedAt < cutoff) || (!v.usedAt && v.expiresAt < now)) {
      store.delete(k);
      removed += 1;
    }
  }
  if (removed > 0) persist();
  return removed;
}
