import type { Address, Hex } from 'viem';
import { pgEnabled, postgresExecutor, withPostgresTransaction } from './client.js';

/// The market's requests, offers and counters, kept by Karwan instead of the
/// old request board (view 40, part A). One row per request, and an append-only
/// list of what happened, which the agents read in order.

export type BoardEvent = 'JobPosted' | 'BidSubmitted' | 'CounterOfferIssued' | 'CounterResponse' | 'BidAccepted';

export interface BoardRow {
  jobId: Hex;
  buyer: Address;
  budget: string;
  deadline: string;
  termsHash: string;
  /// None, Posted, Accepted, Cancelled, Expired, as the old board numbers them.
  state: 0 | 1 | 2 | 3 | 4;
  acceptedSeller: Address | null;
  acceptedPrice: string;
  acceptedDeadline: string;
  /// Keyed by the seller's lowercase address; one offer per seller.
  offers: Record<string, { seller: Address; price: string; deadline: string }>;
  counters: Record<string, { price: string; deadline: string }>;
  /// Posted on the old board before the switch; offers and counters made there
  /// are read from it the first time a new step needs them.
  fromChain?: boolean;
}

export interface StoredBoardEvent {
  id: number;
  jobId: Hex;
  kind: BoardEvent;
  /// The event's fields, with amounts and times as decimal strings.
  args: Record<string, unknown>;
  at: number;
}

export interface BoardChange {
  row: BoardRow;
  event: { kind: BoardEvent; args: Record<string, unknown> };
}

export interface BoardStore {
  get(jobId: Hex): Promise<BoardRow | null>;
  /// Adds a request read from the old board; a row already kept wins.
  seed(row: BoardRow): Promise<void>;
  /// Applies one step to a request under its lock and appends its event. `apply`
  /// throws to refuse, and nothing is written.
  update(jobId: Hex, apply: (row: BoardRow | null) => BoardChange): Promise<{ eventId: number }>;
  eventsAfter(id: number, limit: number): Promise<StoredBoardEvent[]>;
  latestEventId(): Promise<number>;
  postedSince(atMs: number): Promise<StoredBoardEvent[]>;
}

const plain = (args: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Record<string, unknown>;

export function memoryBoardStore(): BoardStore {
  const rows = new Map<string, BoardRow>();
  const events: StoredBoardEvent[] = [];
  const key = (id: Hex) => id.toLowerCase();
  const copy = <T>(v: T): T => structuredClone(v);
  return {
    async get(jobId) {
      const r = rows.get(key(jobId));
      return r ? copy(r) : null;
    },
    async seed(row) {
      if (!rows.has(key(row.jobId))) rows.set(key(row.jobId), copy(row));
    },
    async update(jobId, apply) {
      const current = rows.get(key(jobId));
      const change = apply(current ? copy(current) : null);
      rows.set(key(jobId), copy(change.row));
      const id = events.length + 1;
      events.push({ id, jobId, kind: change.event.kind, args: plain(change.event.args), at: Date.now() });
      return { eventId: id };
    },
    async eventsAfter(id, limit) {
      return events.filter((e) => e.id > id).slice(0, limit).map(copy);
    },
    async latestEventId() {
      return events.length;
    },
    async postedSince(atMs) {
      return events.filter((e) => e.kind === 'JobPosted' && e.at >= atMs).map(copy);
    },
  };
}

type EventRow = { id: string; job_id: string; kind: BoardEvent; data: Record<string, unknown>; at: string };
const fromEventRow = (r: EventRow): StoredBoardEvent => ({ id: Number(r.id), jobId: r.job_id as Hex, kind: r.kind, args: r.data, at: Number(r.at) });

export function postgresBoardStore(): BoardStore {
  return {
    async get(jobId) {
      const res = await postgresExecutor().query('SELECT data FROM market_requests WHERE job_id = $1', [jobId.toLowerCase()]);
      return (res.rows[0]?.data as BoardRow | undefined) ?? null;
    },
    async seed(row) {
      await postgresExecutor().query(
        'INSERT INTO market_requests (job_id, data) VALUES ($1, $2) ON CONFLICT (job_id) DO NOTHING',
        [row.jobId.toLowerCase(), row],
      );
    },
    async update(jobId, apply) {
      return withPostgresTransaction(async (tx) => {
        const id = jobId.toLowerCase();
        const res = await tx.query('SELECT data FROM market_requests WHERE job_id = $1 FOR UPDATE', [id]);
        const current = (res.rows[0]?.data as BoardRow | undefined) ?? null;
        const change = apply(current);
        if (current) {
          await tx.query('UPDATE market_requests SET data = $2 WHERE job_id = $1', [id, change.row]);
        } else {
          const inserted = await tx.query(
            'INSERT INTO market_requests (job_id, data) VALUES ($1, $2) ON CONFLICT (job_id) DO NOTHING RETURNING job_id',
            [id, change.row],
          );
          // A post racing another post of the same number: the board's own rule.
          if (inserted.rows.length === 0) throw Object.assign(new Error('JobAlreadyExists'), { code: 'JobAlreadyExists' });
        }
        const ev = await tx.query(
          'INSERT INTO market_board_events (job_id, kind, data, at) VALUES ($1, $2, $3, $4) RETURNING id',
          [id, change.event.kind, plain(change.event.args), Date.now()],
        );
        return { eventId: Number(ev.rows[0]!.id) };
      });
    },
    async eventsAfter(id, limit) {
      const res = await postgresExecutor().query(
        'SELECT id, job_id, kind, data, at FROM market_board_events WHERE id > $1 ORDER BY id LIMIT $2',
        [id, limit],
      );
      return (res.rows as EventRow[]).map(fromEventRow);
    },
    async latestEventId() {
      const res = await postgresExecutor().query('SELECT COALESCE(MAX(id), 0) AS id FROM market_board_events');
      return Number(res.rows[0]?.id ?? 0);
    },
    async postedSince(atMs) {
      const res = await postgresExecutor().query(
        "SELECT id, job_id, kind, data, at FROM market_board_events WHERE kind = 'JobPosted' AND at >= $1 ORDER BY id",
        [atMs],
      );
      return (res.rows as EventRow[]).map(fromEventRow);
    },
  };
}

export function boardStore(): BoardStore {
  return pgEnabled ? postgresBoardStore() : memoryBoardStore();
}
