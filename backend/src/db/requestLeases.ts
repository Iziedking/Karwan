import { pgEnabled, postgresExecutor } from './client.js';
import type { SqlExecutor } from './migrations.js';

/// Which server is working a request (view 48, step 8d; view 87). One row per
/// request. A claim lands only when nobody holds the request or the holder's
/// time ran out, so two servers never bargain or pay for the same request.

export interface RequestLeaseStore {
  /// Takes or renews the lease. False when another owner holds it.
  claim(jobId: string, owner: string, now: number, ms: number): Promise<boolean>;
  holds(jobId: string, owner: string, now: number): Promise<boolean>;
  /// Lets go, if this owner holds it.
  release(jobId: string, owner: string): Promise<void>;
}

const key = (jobId: string) => jobId.toLowerCase();

export function memoryRequestLeaseStore(): RequestLeaseStore {
  const rows = new Map<string, { owner: string; until: number }>();
  return {
    async claim(jobId, owner, now, ms) {
      const row = rows.get(key(jobId));
      if (row && row.owner !== owner && row.until >= now) return false;
      rows.set(key(jobId), { owner, until: now + ms });
      return true;
    },
    async holds(jobId, owner, now) {
      const row = rows.get(key(jobId));
      return !!row && row.owner === owner && row.until >= now;
    },
    async release(jobId, owner) {
      if (rows.get(key(jobId))?.owner === owner) rows.delete(key(jobId));
    },
  };
}

export function postgresRequestLeaseStore(db: SqlExecutor): RequestLeaseStore {
  return {
    async claim(jobId, owner, now, ms) {
      const res = await db.query(
        `INSERT INTO request_leases_v1 (job_id, owner, until) VALUES ($1, $2, $3)
         ON CONFLICT (job_id) DO UPDATE SET owner = EXCLUDED.owner, until = EXCLUDED.until
         WHERE request_leases_v1.owner = EXCLUDED.owner OR request_leases_v1.until < $4
         RETURNING job_id`,
        [key(jobId), owner, now + ms, now],
      );
      return res.rows.length > 0;
    },
    async holds(jobId, owner, now) {
      const res = await db.query('SELECT 1 FROM request_leases_v1 WHERE job_id = $1 AND owner = $2 AND until >= $3', [key(jobId), owner, now]);
      return res.rows.length > 0;
    },
    async release(jobId, owner) {
      await db.query('DELETE FROM request_leases_v1 WHERE job_id = $1 AND owner = $2', [key(jobId), owner]);
    },
  };
}

const memory = memoryRequestLeaseStore();
let store: RequestLeaseStore | null = null;

/// The live store: Postgres when it is on, else memory.
export function requestLeaseStore(): RequestLeaseStore {
  store ??= pgEnabled ? postgresRequestLeaseStore(postgresExecutor()) : memory;
  return store;
}

export function setRequestLeaseStoreForTest(next: RequestLeaseStore | null): void {
  store = next;
}
