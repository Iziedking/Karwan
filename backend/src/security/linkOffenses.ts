/// Persistent record of users caught submitting a flagged (suspicious or
/// malicious) link, on either the delivery-proof or the in-app chat surface.
/// The reputation engine reads the per-address count as a hard penalty signal:
/// pushing a phishing link at a counterparty is one of the worst trust breaches
/// on the platform, so even a single offense drops the score significantly.
///
/// Flat-file persisted (same pattern as the briefs/deals stores) so an offense
/// survives a backend restart. One offense is counted per (address, jobId,
/// surface) so a retry of the same blocked action doesn't inflate the count.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';

export interface LinkOffense {
  address: string;
  count: number;
  lastAt: number;
  lastVerdict: 'suspicious' | 'malicious';
  lastSurface: 'delivery' | 'chat';
  lastReasons: string[];
  /// Dedupe keys already counted, so the same blocked submission retried
  /// doesn't double-count. Key = `${jobId}:${surface}`.
  seen: string[];
}

const STORE_PATH = resolve(process.cwd(), 'data', 'link-offenses.json');
const store = new Map<string, LinkOffense>();
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const obj = JSON.parse(raw) as Record<string, LinkOffense>;
    for (const [k, v] of Object.entries(obj)) store.set(k, v);
    logger.info({ count: store.size }, 'link offenses loaded from disk');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'link offenses load failed, starting empty');
  }
}

function persist(): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj: Record<string, LinkOffense> = {};
    for (const [k, v] of store.entries()) obj[k] = v;
    writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'link offenses persist failed');
  }
}

export function recordLinkOffense(input: {
  address: string;
  jobId: string;
  surface: 'delivery' | 'chat';
  verdict: 'suspicious' | 'malicious';
  reasons: string[];
}): void {
  load();
  const address = input.address.toLowerCase();
  const key = `${input.jobId.toLowerCase()}:${input.surface}`;
  const existing = store.get(address);
  if (existing?.seen.includes(key)) return; // already counted this offense
  const next: LinkOffense = existing
    ? { ...existing }
    : {
        address,
        count: 0,
        lastAt: 0,
        lastVerdict: input.verdict,
        lastSurface: input.surface,
        lastReasons: [],
        seen: [],
      };
  next.count += 1;
  next.lastAt = Date.now();
  next.lastVerdict = input.verdict;
  next.lastSurface = input.surface;
  next.lastReasons = input.reasons.slice(0, 8);
  next.seen = [...next.seen, key].slice(-200);
  store.set(address, next);
  persist();
}

/// Number of distinct flagged-link offenses recorded against an address.
export function getLinkOffenseCount(address: string): number {
  load();
  return store.get(address.toLowerCase())?.count ?? 0;
}
