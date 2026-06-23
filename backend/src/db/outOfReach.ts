import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { NearMissApproval } from './nearMiss.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'out-of-reach.json');

/// Enough of the passed near-miss to re-raise it on demand. When the buyer
/// passed the best real price and no cheaper seller turned up, the advisory
/// offers a one-tap "reconsider" that re-raises this exact ask so they can
/// proceed after all. The near-miss record itself is deleted on re-open, so we
/// snapshot it here.
export interface PassedOffer {
  buyerUser: string;
  buyerAgent: string;
  sellerUser: string;
  sellerAgent: string;
  proceedPriceUsdc: string;
  limitUsdc: string;
  buyerCeilingUsdc: string;
  sellerFloorUsdc: string;
}

/// Durable "no match at your budget" marker for a job. Written when the buyer
/// passes a near-miss (the best real price), then carried forward as the only
/// remaining topical matches keep skipping for being far over the ceiling. The
/// near-miss record itself is deleted on re-open (so a fresh seller can raise a
/// new ask), so this is the persistent trace that the buyer already passed and
/// the deal is out of reach. Non-destructive: the request stays open; a cheaper
/// seller clears this. Survives a reload, unlike the in-memory event ring.
export interface OutOfReachRecord {
  jobId: string;
  /// The buyer's effective ceiling when they passed.
  ceilingUsdc: number;
  /// The lowest far seller floor seen since the pass, or null until one skips.
  closestFloorUsdc: number | null;
  /// The best real price the buyer passed, kept so the advisory can offer a
  /// one-tap reconsider when no cheaper match showed up.
  passed: PassedOffer;
  /// When the buyer passed the near-miss.
  passedAt: number;
  /// When the automatic "last call" near the deadline was delivered, so it only
  /// fires once. Unset until the expiry watcher re-surfaces the passed offer.
  lastCallAt?: number;
  updatedAt: number;
}

export function getOutOfReach(jobId: string): OutOfReachRecord | null {
  return loadFile()[jobId.toLowerCase()] ?? null;
}

/// Mark that the buyer passed a near-miss on this job, snapshotting the offer so
/// it can be re-raised. Idempotent: keeps the earliest passedAt and the lowest
/// closest floor, but refreshes the passed offer to the most recent one.
export function markPassed(jobId: string, nearMiss: NearMissApproval): void {
  const store = loadFile();
  const key = jobId.toLowerCase();
  const prev = store[key];
  store[key] = {
    jobId: key,
    ceilingUsdc: Number(nearMiss.limitUsdc),
    closestFloorUsdc: prev?.closestFloorUsdc ?? null,
    passed: {
      buyerUser: nearMiss.buyerUser,
      buyerAgent: nearMiss.buyerAgent,
      sellerUser: nearMiss.sellerUser,
      sellerAgent: nearMiss.sellerAgent,
      proceedPriceUsdc: nearMiss.proceedPriceUsdc,
      limitUsdc: nearMiss.limitUsdc,
      buyerCeilingUsdc: nearMiss.buyerCeilingUsdc,
      sellerFloorUsdc: nearMiss.sellerFloorUsdc,
    },
    passedAt: prev?.passedAt ?? Date.now(),
    // Preserve the last-call flag across a re-pass so a passed last call never
    // re-arms the watcher.
    lastCallAt: prev?.lastCallAt,
    updatedAt: Date.now(),
  };
  saveFile(store);
}

/// Mark that the automatic last-call near the deadline has been delivered, so
/// the expiry watcher re-surfaces the passed offer at most once.
export function markLastCall(jobId: string): void {
  const store = loadFile();
  const key = jobId.toLowerCase();
  const rec = store[key];
  if (!rec) return;
  store[key] = { ...rec, lastCallAt: Date.now(), updatedAt: Date.now() };
  saveFile(store);
}

/// Record the closest far seller floor seen since the pass. No-op when the buyer
/// has not passed (we only declare out-of-reach after they saw the best price).
/// Returns the updated record when the marker exists, else null.
export function noteFarFloor(jobId: string, floorUsdc: number): OutOfReachRecord | null {
  const store = loadFile();
  const key = jobId.toLowerCase();
  const rec = store[key];
  if (!rec) return null;
  const next: OutOfReachRecord = {
    ...rec,
    closestFloorUsdc:
      rec.closestFloorUsdc == null ? floorUsdc : Math.min(rec.closestFloorUsdc, floorUsdc),
    updatedAt: Date.now(),
  };
  store[key] = next;
  saveFile(store);
  return next;
}

/// A crossable path appeared (fresh near-miss, accepted bid, funded deal): drop
/// the marker so the page leaves the out-of-reach state.
export function clearOutOfReach(jobId: string): void {
  const store = loadFile();
  const key = jobId.toLowerCase();
  if (store[key]) {
    delete store[key];
    saveFile(store);
  }
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, OutOfReachRecord> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, OutOfReachRecord>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, OutOfReachRecord>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
