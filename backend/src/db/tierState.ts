import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Tier } from '../reputation/config.js';

/// Per-address reputation-tier state, used to fire a one-shot "you reached a new
/// tier" celebration exactly once per crossing. Flat-file only (no PG): it's
/// ephemeral and non-critical. the worst case on data loss is one re-celebration.

const STORE_PATH = resolve(process.cwd(), 'data', 'tier-state.json');

export interface TierState {
  /// The highest tier we've already acknowledged for this address.
  tier: Tier;
  /// Epoch ms until which the profile shows the congrats card. 0 when not
  /// celebrating. Set to now + 48h on a tier-up.
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
