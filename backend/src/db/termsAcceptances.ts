import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'terms-acceptances.json');

/// Single acceptance row. One row per (address, version) pair: bumping the
/// current version re-prompts every existing user, and their latest
/// acceptance is what the gate consults. We do not delete old rows; the audit
/// trail of who accepted what is worth keeping.
export interface TermsAcceptance {
  address: string;
  version: number;
  acceptedAt: number;
  /// Optional. We do not log IP unless the operator opts into it via env;
  /// keeping the type wide lets us populate it later without a migration.
  ip?: string;
  /// Optional. User agent string at acceptance time. Same opt-in shape.
  userAgent?: string;
  /// The wallet signature over the canonical acceptance message, for web3
  /// users. The cryptographic proof they consented. Absent for circle
  /// (passkey/OTP) users, whose authenticated click is the consent.
  signature?: string;
}

const store = new Map<string, TermsAcceptance>();
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const arr = JSON.parse(raw) as TermsAcceptance[];
    for (const a of arr) store.set(key(a.address, a.version), a);
    logger.info({ count: store.size }, 'terms acceptances loaded from disk');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'terms acceptances load failed, starting empty');
  }
}

function persist(): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify([...store.values()], null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'terms acceptances persist failed');
  }
}

function key(address: string, version: number): string {
  return `${address.toLowerCase()}:${version}`;
}

export function recordAcceptance(input: TermsAcceptance): TermsAcceptance {
  load();
  const next: TermsAcceptance = {
    ...input,
    address: input.address.toLowerCase(),
  };
  store.set(key(next.address, next.version), next);
  persist();
  return next;
}

/// Returns the most recent version this address has accepted, or null.
export function highestAcceptedVersion(address: string): number | null {
  load();
  const a = address.toLowerCase();
  let highest: number | null = null;
  for (const row of store.values()) {
    if (row.address === a) {
      if (highest == null || row.version > highest) highest = row.version;
    }
  }
  return highest;
}

export function listAcceptancesFor(address: string): TermsAcceptance[] {
  load();
  const a = address.toLowerCase();
  return [...store.values()].filter((r) => r.address === a);
}
