import type { AgentRecord, LockEntry } from './agentRecord.js';

/// What an agent has locked alone, counted against its person's limits (view
/// 87). An amount is held before the deal is funded, so two requests agreed in
/// the same minute cannot both fit under one limit. Pure.

const WEEK_MS = 7 * 86_400_000;
/// A held amount waits at most this long: a seller has 24 hours to answer.
export const HELD_FOR_MS = 26 * 60 * 60_000;

export const microsOf = (usdc: number | string): bigint => {
  const [whole = '0', frac = ''] = String(typeof usdc === 'number' ? usdc.toFixed(6) : usdc).split('.');
  return BigInt(whole) * 1_000_000n + BigInt((frac + '000000').slice(0, 6));
};

const live = (e: LockEntry, now: number) => e.at <= now && (e.state !== 'held' || now - e.at < HELD_FOR_MS);
const same = (e: LockEntry, jobId: string) => e.jobId.toLowerCase() === jobId.toLowerCase();

export function lockedThisWeekMicros(locks: readonly LockEntry[], now: number): bigint {
  return locks.filter((e) => live(e, now) && now - e.at < WEEK_MS).reduce((sum, e) => sum + microsOf(e.usdc), 0n);
}

function localDay(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function locksToday(locks: readonly LockEntry[], now: number, timeZone: string): number {
  const today = localDay(now, timeZone);
  return locks.filter((e) => live(e, now) && localDay(e.at, timeZone) === today).length;
}

/// The other requests' locks: a request never counts against itself.
export function otherLocks(locks: readonly LockEntry[], jobId: string): LockEntry[] {
  return locks.filter((e) => !same(e, jobId));
}

const withLocks = (r: AgentRecord, locks: LockEntry[]): AgentRecord => (r.lock ? { ...r, lock: { ...r.lock, locks } } : r);

/// Sets an amount aside for this request, in place of any it held before.
/// Entries older than a week are dropped here, so the list stays short.
export function reserved(r: AgentRecord, e: { at: number; usdc: number; jobId: string }): AgentRecord {
  if (!r.lock) return r;
  const kept = otherLocks(r.lock.locks, e.jobId).filter((x) => e.at - x.at < WEEK_MS);
  return withLocks(r, [...kept, { ...e, jobId: e.jobId.toLowerCase(), state: 'held' }]);
}

export function settled(r: AgentRecord, jobId: string): AgentRecord {
  if (!r.lock) return r;
  return withLocks(r, r.lock.locks.map((e) => (same(e, jobId) ? { ...e, state: 'done' as const } : e)));
}

/// Gives back an amount that was held and never locked. A finished lock stays.
export function released(r: AgentRecord, jobId: string): AgentRecord {
  if (!r.lock) return r;
  return withLocks(r, r.lock.locks.filter((e) => !(same(e, jobId) && e.state === 'held')));
}

export function heldFor(r: AgentRecord, jobId: string): LockEntry | null {
  return r.lock?.locks.find((e) => same(e, jobId)) ?? null;
}
