import type { Address } from 'viem';
import { pgEnabled, postgresExecutor } from './client.js';

/// Hourly work posted to the market (view 32): the hirer says the most they
/// pay an hour, sellers who fit offer a rate, the hirer's agent ranks them by
/// what they have done, and hiring one opens the work on the time escrow.
/// Kept beside fixed-price requests so no agent bids a fixed price on it.

export type WorkRequestStatus = 'open' | 'hired' | 'closed' | 'expired';
export type WorkOfferStatus = 'live' | 'withdrawn' | 'hired' | 'filled';

export interface WorkRequest {
  id: string;
  hirer: Address;
  kind: 'hourly' | 'monthly';
  title: string;
  brief: string;
  keywords: string[];
  maxRateMicros: string;
  /// Most hours a week; 1 for a monthly retainer.
  maxHours: number;
  periods: number;
  /// Milliseconds; offers close when the work would have started.
  startsAt: number;
  status: WorkRequestStatus;
  workId?: string;
  hiredOffer?: string;
  /// How many sellers who fit were told when it was posted.
  told?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkOffer {
  id: string;
  requestId: string;
  seller: Address;
  sellerAgent: Address;
  rateMicros: string;
  note: string;
  status: WorkOfferStatus;
  createdAt: number;
  updatedAt: number;
}

export interface WorkRequestsStore {
  get(id: string): Promise<WorkRequest | null>;
  create(r: WorkRequest): Promise<void>;
  patch(id: string, patch: Partial<WorkRequest>): Promise<WorkRequest | null>;
  patchIfStatus(id: string, from: WorkRequestStatus[], patch: Partial<WorkRequest>): Promise<WorkRequest | null>;
  listOpen(): Promise<WorkRequest[]>;
  listBy(hirer: string): Promise<WorkRequest[]>;
  offers(requestId: string): Promise<WorkOffer[]>;
  offer(id: string): Promise<WorkOffer | null>;
  liveOfferBy(requestId: string, seller: string): Promise<WorkOffer | null>;
  createOffer(o: WorkOffer): Promise<void>;
  patchOffer(id: string, patch: Partial<WorkOffer>): Promise<WorkOffer | null>;
}

const lower = (a: string) => a.toLowerCase();

export function memoryWorkRequestsStore(): WorkRequestsStore {
  const reqs = new Map<string, WorkRequest>();
  const offers = new Map<string, WorkOffer>();
  const copy = <T>(v: T): T => structuredClone(v);
  const newest = <T extends { createdAt: number }>(xs: T[]) => xs.sort((a, b) => b.createdAt - a.createdAt);
  return {
    async get(id) {
      const r = reqs.get(id);
      return r ? copy(r) : null;
    },
    async create(r) {
      reqs.set(r.id, copy(r));
    },
    async patch(id, patch) {
      const r = reqs.get(id);
      if (!r) return null;
      const next = { ...r, ...patch, updatedAt: Date.now() };
      reqs.set(id, next);
      return copy(next);
    },
    async patchIfStatus(id, from, patch) {
      const r = reqs.get(id);
      if (!r || !from.includes(r.status)) return null;
      return this.patch(id, patch);
    },
    async listOpen() {
      return newest([...reqs.values()].filter((r) => r.status === 'open')).map(copy);
    },
    async listBy(hirer) {
      return newest([...reqs.values()].filter((r) => lower(r.hirer) === lower(hirer))).map(copy);
    },
    async offers(requestId) {
      return [...offers.values()].filter((o) => o.requestId === requestId).sort((a, b) => a.createdAt - b.createdAt).map(copy);
    },
    async offer(id) {
      const o = offers.get(id);
      return o ? copy(o) : null;
    },
    async liveOfferBy(requestId, seller) {
      const o = [...offers.values()].find((x) => x.requestId === requestId && lower(x.seller) === lower(seller) && x.status === 'live');
      return o ? copy(o) : null;
    },
    async createOffer(o) {
      offers.set(o.id, copy(o));
    },
    async patchOffer(id, patch) {
      const o = offers.get(id);
      if (!o) return null;
      const next = { ...o, ...patch, updatedAt: Date.now() };
      offers.set(id, next);
      return copy(next);
    },
  };
}

export function postgresWorkRequestsStore(): WorkRequestsStore {
  const q = () => postgresExecutor();
  const one = <T>(rows: Array<{ data: unknown }>) => (rows[0]?.data as T | undefined) ?? null;
  const update = (table: string) =>
    `UPDATE ${table} SET data = data || $2::jsonb || jsonb_build_object('updatedAt', $3::bigint) WHERE id = $1 RETURNING data`;
  return {
    async get(id) {
      return one<WorkRequest>((await q().query('SELECT data FROM work_requests WHERE id = $1', [id])).rows as never);
    },
    async create(r) {
      await q().query('INSERT INTO work_requests (id, data) VALUES ($1, $2)', [r.id, r]);
    },
    async patch(id, patch) {
      return one<WorkRequest>((await q().query(update('work_requests'), [id, JSON.stringify(patch), Date.now()])).rows as never);
    },
    async patchIfStatus(id, from, patch) {
      const res = await q().query(
        `UPDATE work_requests SET data = data || $3::jsonb || jsonb_build_object('updatedAt', $4::bigint)
         WHERE id = $1 AND data->>'status' = ANY($2) RETURNING data`,
        [id, from, JSON.stringify(patch), Date.now()],
      );
      return one<WorkRequest>(res.rows as never);
    },
    async listOpen() {
      const res = await q().query(`SELECT data FROM work_requests WHERE data->>'status' = 'open' ORDER BY (data->>'createdAt')::bigint DESC LIMIT 200`);
      return res.rows.map((r) => r.data as WorkRequest);
    },
    async listBy(hirer) {
      const res = await q().query(
        `SELECT data FROM work_requests WHERE lower(data->>'hirer') = lower($1) ORDER BY (data->>'createdAt')::bigint DESC LIMIT 100`,
        [hirer],
      );
      return res.rows.map((r) => r.data as WorkRequest);
    },
    async offers(requestId) {
      const res = await q().query(`SELECT data FROM work_offers WHERE request_id = $1 ORDER BY (data->>'createdAt')::bigint`, [requestId]);
      return res.rows.map((r) => r.data as WorkOffer);
    },
    async offer(id) {
      return one<WorkOffer>((await q().query('SELECT data FROM work_offers WHERE id = $1', [id])).rows as never);
    },
    async liveOfferBy(requestId, seller) {
      const res = await q().query(
        `SELECT data FROM work_offers WHERE request_id = $1 AND lower(data->>'seller') = lower($2) AND data->>'status' = 'live' LIMIT 1`,
        [requestId, seller],
      );
      return one<WorkOffer>(res.rows as never);
    },
    async createOffer(o) {
      await q().query('INSERT INTO work_offers (id, request_id, data) VALUES ($1, $2, $3)', [o.id, o.requestId, o]);
    },
    async patchOffer(id, patch) {
      return one<WorkOffer>((await q().query(update('work_offers'), [id, JSON.stringify(patch), Date.now()])).rows as never);
    },
  };
}

export const workRequestsStore: WorkRequestsStore = pgEnabled ? postgresWorkRequestsStore() : memoryWorkRequestsStore();
