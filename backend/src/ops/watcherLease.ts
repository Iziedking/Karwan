/// One runner for each background job, and one action at a time on each deal
/// (view 61). A job runs a tick only while its process holds the job's lease;
/// an action on one deal runs only under a claim on that deal. Both live in
/// Postgres with an expiry, so a process that dies loses them and the next one
/// carries on. Without Postgres there is one process, and the memory store
/// gives the same answers.

import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '../db/migrations.js';

export interface LeaseRow {
  name: string;
  holder: string;
  expiresAt: number;
  takenAt: number;
}

export interface LeaseStore {
  /// Takes the lease, or renews it for its holder. False while another holder's lease is live.
  take(name: string, holder: string, ttlMs: number, now: number): Promise<boolean>;
  drop(name: string, holder: string): Promise<void>;
  /// Claims one key. False while any claim on it is live, the caller's own included.
  claim(key: string, holder: string, ttlMs: number, now: number): Promise<boolean>;
  unclaim(key: string, holder: string): Promise<void>;
  leases(): Promise<LeaseRow[]>;
}

const LEASE_FLOOR_MS = 2 * 60_000;
export const CLAIM_TTL_MS = 10 * 60_000;

export function leaseTtlMs(everyMs: number): number {
  return Math.max(2 * everyMs, LEASE_FLOOR_MS);
}

export function memoryLeaseStore(): LeaseStore {
  const leases = new Map<string, LeaseRow>();
  const claims = new Map<string, { holder: string; expiresAt: number }>();
  return {
    async take(name, holder, ttlMs, now) {
      const current = leases.get(name);
      if (current && current.holder !== holder && current.expiresAt > now) return false;
      const takenAt = current && current.holder === holder ? current.takenAt : now;
      leases.set(name, { name, holder, expiresAt: now + ttlMs, takenAt });
      return true;
    },
    async drop(name, holder) {
      if (leases.get(name)?.holder === holder) leases.delete(name);
    },
    async claim(key, holder, ttlMs, now) {
      const current = claims.get(key);
      if (current && current.expiresAt > now) return false;
      claims.set(key, { holder, expiresAt: now + ttlMs });
      return true;
    },
    async unclaim(key, holder) {
      if (claims.get(key)?.holder === holder) claims.delete(key);
    },
    async leases() {
      return [...leases.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

export function postgresLeaseStore(executor: SqlExecutor): LeaseStore {
  return {
    async take(name, holder, ttlMs, now) {
      const result = await executor.query(
        `INSERT INTO watcher_leases_v1 (name, holder, expires_at, taken_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE
           SET holder = EXCLUDED.holder,
               expires_at = EXCLUDED.expires_at,
               taken_at = CASE WHEN watcher_leases_v1.holder = EXCLUDED.holder
                               THEN watcher_leases_v1.taken_at ELSE EXCLUDED.taken_at END
           WHERE watcher_leases_v1.holder = EXCLUDED.holder OR watcher_leases_v1.expires_at <= $4
         RETURNING name`,
        [name, holder, now + ttlMs, now],
      );
      return result.rows.length === 1;
    },
    async drop(name, holder) {
      await executor.query(`DELETE FROM watcher_leases_v1 WHERE name = $1 AND holder = $2`, [name, holder]);
    },
    async claim(key, holder, ttlMs, now) {
      const result = await executor.query(
        `INSERT INTO watcher_claims_v1 (key, holder, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE
           SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
           WHERE watcher_claims_v1.expires_at <= $4
         RETURNING key`,
        [key, holder, now + ttlMs, now],
      );
      return result.rows.length === 1;
    },
    async unclaim(key, holder) {
      await executor.query(`DELETE FROM watcher_claims_v1 WHERE key = $1 AND holder = $2`, [key, holder]);
    },
    async leases() {
      const result = await executor.query(
        `SELECT name, holder, expires_at, taken_at FROM watcher_leases_v1 ORDER BY name`,
      );
      return (result.rows as Array<{ name: string; holder: string; expires_at: string; taken_at: string }>).map((r) => ({
        name: r.name,
        holder: r.holder,
        expiresAt: Number(r.expires_at),
        takenAt: Number(r.taken_at),
      }));
    },
  };
}

export interface LeasedTick {
  store: LeaseStore;
  name: string;
  holder: string;
  ttlMs: number;
  now: () => number;
  tick: () => unknown;
  /// Renews the lease while a long tick runs. Off in tests.
  renewEveryMs?: number;
}

/// Runs one tick if this holder has, or can take, the job's lease. True when it ran.
export async function runLeasedTick(input: LeasedTick): Promise<boolean> {
  const { store, name, holder, ttlMs, now } = input;
  if (!(await store.take(name, holder, ttlMs, now()))) return false;
  const renew = input.renewEveryMs
    ? setInterval(() => void store.take(name, holder, ttlMs, now()).catch(() => undefined), input.renewEveryMs)
    : null;
  renew?.unref?.();
  try {
    await input.tick();
    return true;
  } finally {
    if (renew) clearInterval(renew);
  }
}

/// Runs `act` under a claim on `key`. False when the key is claimed elsewhere
/// (or by a run of this process still going); the caller tries next tick.
export async function withClaim(
  input: { store: LeaseStore; key: string; holder: string; now: () => number; ttlMs?: number },
  act: () => Promise<unknown>,
): Promise<boolean> {
  const { store, key, holder } = input;
  if (!(await store.claim(key, holder, input.ttlMs ?? CLAIM_TTL_MS, input.now()))) return false;
  try {
    await act();
    return true;
  } finally {
    await store.unclaim(key, holder).catch(() => undefined);
  }
}

/// This process, as a lease holder.
export const PROCESS_HOLDER = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
