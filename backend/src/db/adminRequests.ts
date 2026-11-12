import type { SqlExecutor } from './migrations.js';

/// A money or chain move asked for on the desk, waiting for a second member
/// (view 64). It runs only once, only after a different member approves it,
/// and only within 24 hours.

export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

export type RequestStatus = 'pending' | 'running' | 'done' | 'failed' | 'refused' | 'cancelled' | 'expired' | 'turned_down';

export interface AdminRequest {
  id: string;
  action: string;
  label: string;
  method: string;
  path: string;
  query: string;
  body: string;
  reason: string;
  requestedBy: { memberId: string; email: string | null; name: string | null };
  requestedAt: number;
  expiresAt: number;
  /// What the target looked like when it was asked for; read again before it runs.
  snapshot: unknown;
  status: RequestStatus;
  approvedBy?: { memberId: string; email: string | null; name: string | null };
  /// A second member who said no; it never runs after.
  turnedDownBy?: { memberId: string; email: string | null; name: string | null };
  decidedAt?: number;
  result?: { status: number; body: unknown };
}

export interface AdminRequestStore {
  insert(r: AdminRequest): Promise<void>;
  get(id: string): Promise<AdminRequest | null>;
  list(limit: number): Promise<AdminRequest[]>;
  /// Moves a request from one status to another only if it is still in the
  /// first; the answer says whether this caller won.
  move(id: string, from: RequestStatus, next: Partial<AdminRequest> & { status: RequestStatus }): Promise<AdminRequest | null>;
}

export function memoryAdminRequestStore(): AdminRequestStore {
  const rows = new Map<string, AdminRequest>();
  return {
    async insert(r) {
      rows.set(r.id, structuredClone(r));
    },
    async get(id) {
      const r = rows.get(id);
      return r ? structuredClone(r) : null;
    },
    async list(limit) {
      return [...rows.values()].sort((a, b) => b.requestedAt - a.requestedAt).slice(0, limit).map((r) => structuredClone(r));
    },
    async move(id, from, next) {
      const r = rows.get(id);
      if (!r || r.status !== from) return null;
      const updated = { ...r, ...structuredClone(next) };
      rows.set(id, updated);
      return structuredClone(updated);
    },
  };
}

export function postgresAdminRequestStore(executor: SqlExecutor): AdminRequestStore {
  return {
    async insert(r) {
      await executor.query(
        `INSERT INTO admin_requests_v1 (id, status, requested_at, data) VALUES ($1, $2, $3, $4)`,
        [r.id, r.status, r.requestedAt, JSON.stringify(r)],
      );
    },
    async get(id) {
      const q = await executor.query(`SELECT data FROM admin_requests_v1 WHERE id = $1`, [id]);
      return (q.rows[0] as { data: AdminRequest } | undefined)?.data ?? null;
    },
    async list(limit) {
      const q = await executor.query(`SELECT data FROM admin_requests_v1 ORDER BY requested_at DESC LIMIT $1`, [limit]);
      return (q.rows as Array<{ data: AdminRequest }>).map((x) => x.data);
    },
    async move(id, from, next) {
      const q = await executor.query(
        `UPDATE admin_requests_v1 SET status = $3, data = data || $4::jsonb
          WHERE id = $1 AND status = $2 RETURNING data`,
        [id, from, next.status, JSON.stringify(next)],
      );
      return (q.rows[0] as { data: AdminRequest } | undefined)?.data ?? null;
    },
  };
}
