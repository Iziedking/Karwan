import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Tier } from '../reputation/config.js';

/// Per-address reputation-tier state, used to fire a one-shot "you reached a new
/// tier" celebration exactly once per crossing. Flat-file only (no PG): it's
/// ephemeral and non-critical. the worst case on data loss is one re-celebration.

const STORE_PATH = resolve(process.cwd(), 'data', 'tier-state.json');

export interface TierState {
  /// The current tier we last recorded for this address (moves up AND down).
  tier: Tier;
  /// The highest tier RANK ever reached (tierRank value). We only celebrate a
  /// genuine all-time high, so re-entering a tier after a drop never re-fires the
  /// congrats card for a tier the user already passed. Optional for back-compat
  /// with rows written before this field existed.
  maxRank?: number;
  /// Epoch ms until which the profile shows the congrats card. 0 when not
  /// celebrating. Set to now + 12h on a genuine tier-up; cleared on a drop.
  celebrateUntil: number;
  /// Last time we recorded a change, for debugging.
  updatedAt: number;
}

export function getTierState(address: string): TierState | null {
  return loadFile()[address.toLowerCase()] ?? null;
}

export function saveTierState(address: string, state: TierState): void {
  const store = loadFile();
  store[address.toLowerCase()] = state;
  saveFile(store);
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, TierState> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, TierState>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, TierState>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
