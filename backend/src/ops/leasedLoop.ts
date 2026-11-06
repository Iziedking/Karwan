/// The live side of ops/watcherLease.ts: the store this process uses, the
/// wrapper each background job's loop goes through, and the shutdown drop.

import { pgEnabled, postgresExecutor } from '../db/client.js';
import { logger } from '../logger.js';
import {
  leaseTtlMs,
  memoryLeaseStore,
  postgresLeaseStore,
  PROCESS_HOLDER,
  runLeasedTick,
  withClaim,
  type LeaseStore,
} from './watcherLease.js';

let store: LeaseStore | null = null;

export function leaseStore(): LeaseStore {
  store ??= pgEnabled ? postgresLeaseStore(postgresExecutor()) : memoryLeaseStore();
  return store;
}

const held = new Set<string>();

/// Wraps one job's tick: it runs only while this process holds the job's
/// lease, never overlaps itself, and never throws into the timer.
export function leased(name: string, everyMs: number, tick: () => unknown): () => Promise<void> {
  const ttlMs = leaseTtlMs(everyMs);
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      const ran = await runLeasedTick({
        store: leaseStore(),
        name,
        holder: PROCESS_HOLDER,
        ttlMs,
        now: Date.now,
        tick,
        renewEveryMs: Math.floor(ttlMs / 3),
      });
      if (ran) held.add(name);
      else held.delete(name);
    } catch (err) {
      logger.error({ job: name, err: (err as Error).message }, 'leased job tick failed');
    } finally {
      busy = false;
    }
  };
}

/// One action on one deal (or offer, or line) at a time across every process.
export function claimed(key: string, act: () => Promise<unknown>): Promise<boolean> {
  return withClaim({ store: leaseStore(), key, holder: PROCESS_HOLDER, now: Date.now }, act);
}

/// On shutdown: hand every lease back so the next container runs at once.
export async function dropHeldLeases(): Promise<void> {
  const names = [...held];
  held.clear();
  await Promise.all(names.map((name) => leaseStore().drop(name, PROCESS_HOLDER).catch(() => undefined)));
}

/// Who holds each job's lease, for /admin/diagnostics.
export async function jobLeases(now = Date.now()) {
  const rows = await leaseStore().leases().catch(() => []);
  return rows.map((r) => ({
    name: r.name,
    holder: r.holder.split(':').slice(0, 2).join(':'),
    thisProcess: r.holder === PROCESS_HOLDER,
    heldForMs: Math.max(0, now - r.takenAt),
    expiresInMs: r.expiresAt - now,
  }));
}
