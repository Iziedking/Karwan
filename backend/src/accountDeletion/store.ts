import type { SqlExecutor } from '../db/migrations.js';

export type DeletionState = 'scheduled' | 'cancelled' | 'refused' | 'erasing' | 'done';

/// What a deletion removed and kept, and the wallets left behind at Circle so
/// money sent to them later can still be returned. No name, no channel id.
export interface DeletionRecord {
  removed: string[];
  kept: string[];
  walletIds: string[];
  /// When the chat was told the account is deleted.
  toldAt?: number;
}

export interface DeletionRequest {
  id: string;
  address: string;
  channel: string;
  state: DeletionState;
  requestedVia: 'chat' | 'admin';
  requestedAt: number;
  dueAt: number;
  closedAt: number | null;
  reason: string | null;
  nullifiersUntil: number | null;
  nullifiersReleasedAt: number | null;
  record: DeletionRecord;
}

type NewRequest = Pick<DeletionRequest, 'id' | 'address' | 'channel' | 'requestedVia' | 'requestedAt' | 'dueAt'>;
type Patch = Partial<Pick<DeletionRequest, 'state' | 'closedAt' | 'reason' | 'nullifiersUntil' | 'record'>>;

export interface DeletionStore {
  get: (id: string) => Promise<DeletionRequest | null>;
  /// The account's deletion that is waiting or running.
  open: (address: string) => Promise<DeletionRequest | null>;
  /// Null when the account already has one waiting or running.
  schedule: (r: NewRequest) => Promise<DeletionRequest | null>;
  /// Moves a request on only from the state it is expected to be in, so a
  /// cancel and the run cannot both win. False when it had moved meanwhile.
  move: (id: string, from: DeletionState, patch: Patch) => Promise<boolean>;
  setRecord: (id: string, record: DeletionRecord) => Promise<void>;
  markNullifiersReleased: (id: string, at: number) => Promise<void>;
  /// Waits that have ended, and erases that have not finished.
  due: (now: number) => Promise<DeletionRequest[]>;
  /// Finished deletions whose World ID hash has been kept long enough.
  nullifiersDue: (now: number) => Promise<DeletionRequest[]>;
  list: (limit: number) => Promise<DeletionRequest[]>;
}

const emptyRecord = (): DeletionRecord => ({ removed: [], kept: [], walletIds: [] });
const OPEN: readonly DeletionState[] = ['scheduled', 'erasing'];

export function createMemoryDeletionStore(): DeletionStore {
  const rows = new Map<string, DeletionRequest>();
  const copy = (r: DeletionRequest): DeletionRequest => ({ ...r, record: structuredClone(r.record) });
  const all = () => [...rows.values()];

  return {
    get: async (id) => {
      const r = rows.get(id);
      return r ? copy(r) : null;
    },
    open: async (address) => {
      const r = all().find((x) => x.address === address.toLowerCase() && OPEN.includes(x.state));
      return r ? copy(r) : null;
    },
    schedule: async (n) => {
      const address = n.address.toLowerCase();
      if (all().some((x) => x.address === address && OPEN.includes(x.state))) return null;
      const r: DeletionRequest = {
        ...n,
        address,
        state: 'scheduled',
        closedAt: null,
        reason: null,
        nullifiersUntil: null,
        nullifiersReleasedAt: null,
        record: emptyRecord(),
      };
      rows.set(r.id, r);
      return copy(r);
    },
    move: async (id, from, patch) => {
      const r = rows.get(id);
      if (!r || r.state !== from) return false;
      rows.set(id, { ...r, ...patch });
      return true;
    },
    setRecord: async (id, record) => {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, record: structuredClone(record) });
    },
    markNullifiersReleased: async (id, at) => {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, nullifiersReleasedAt: at });
    },
    due: async (now) =>
      all()
        .filter((r) => r.state === 'erasing' || (r.state === 'scheduled' && r.dueAt <= now))
        .sort((a, b) => a.dueAt - b.dueAt)
        .map(copy),
    nullifiersDue: async (now) =>
      all()
        .filter((r) => r.state === 'done' && r.nullifiersUntil !== null && r.nullifiersUntil <= now && r.nullifiersReleasedAt === null)
        .map(copy),
    list: async (limit) =>
      all()
        .sort((a, b) => b.requestedAt - a.requestedAt)
        .slice(0, limit)
        .map(copy),
  };
}

type Transaction = <T>(operation: (tx: SqlExecutor) => Promise<T>) => Promise<T>;

interface Row extends Record<string, unknown> {
  id: string;
  address: string;
  channel: string;
  state: DeletionState;
  requested_via: 'chat' | 'admin';
  requested_at: string;
  due_at: string;
  closed_at: string | null;
  reason: string | null;
  nullifiers_until: string | null;
  nullifiers_released_at: string | null;
  record: DeletionRecord;
}

const num = (v: string | null) => (v === null ? null : Number(v));

const toRequest = (r: Row): DeletionRequest => ({
  id: r.id,
  address: r.address,
  channel: r.channel,
  state: r.state,
  requestedVia: r.requested_via,
  requestedAt: Number(r.requested_at),
  dueAt: Number(r.due_at),
  closedAt: num(r.closed_at),
  reason: r.reason,
  nullifiersUntil: num(r.nullifiers_until),
  nullifiersReleasedAt: num(r.nullifiers_released_at),
  record: r.record,
});

const COLUMNS: Record<keyof Patch, string> = {
  state: 'state',
  closedAt: 'closed_at',
  reason: 'reason',
  nullifiersUntil: 'nullifiers_until',
  record: 'record',
};

export function createPostgresDeletionStore(transaction: Transaction): DeletionStore {
  const select = (where: string, params: unknown[], tail = '') =>
    transaction(async (tx) => {
      const r = await tx.query<Row>(`SELECT * FROM account_deletions_v1 WHERE ${where} ${tail}`, params);
      return r.rows.map(toRequest);
    });

  return {
    get: async (id) => (await select('id = $1', [id]))[0] ?? null,
    open: async (address) => (await select(`address = $1 AND state IN ('scheduled', 'erasing')`, [address.toLowerCase()]))[0] ?? null,
    schedule: (n) =>
      transaction(async (tx) => {
        const r = await tx.query<Row>(
          `INSERT INTO account_deletions_v1 (id, address, channel, state, requested_via, requested_at, due_at, record)
           VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7::jsonb)
           ON CONFLICT DO NOTHING RETURNING *`,
          [n.id, n.address.toLowerCase(), n.channel, n.requestedVia, n.requestedAt, n.dueAt, JSON.stringify(emptyRecord())],
        );
        return r.rows[0] ? toRequest(r.rows[0]) : null;
      }),
    move: (id, from, patch) =>
      transaction(async (tx) => {
        const keys = (Object.keys(patch) as (keyof Patch)[]).filter((k) => patch[k] !== undefined);
        const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 3}${k === 'record' ? '::jsonb' : ''}`);
        const values = keys.map((k) => (k === 'record' ? JSON.stringify(patch[k]) : patch[k]));
        const r = await tx.query(
          `UPDATE account_deletions_v1 SET ${sets.length ? sets.join(', ') : 'state = state'}
           WHERE id = $1 AND state = $2 RETURNING id`,
          [id, from, ...values],
        );
        return r.rows.length === 1;
      }),
    setRecord: (id, record) =>
      transaction(async (tx) => {
        await tx.query(`UPDATE account_deletions_v1 SET record = $2::jsonb WHERE id = $1`, [id, JSON.stringify(record)]);
      }),
    markNullifiersReleased: (id, at) =>
      transaction(async (tx) => {
        await tx.query(`UPDATE account_deletions_v1 SET nullifiers_released_at = $2 WHERE id = $1`, [id, at]);
      }),
    due: (now) => select(`state = 'erasing' OR (state = 'scheduled' AND due_at <= $1)`, [now], 'ORDER BY due_at'),
    nullifiersDue: (now) =>
      select(`state = 'done' AND nullifiers_until IS NOT NULL AND nullifiers_until <= $1 AND nullifiers_released_at IS NULL`, [now]),
    list: (limit) => select('TRUE', [], `ORDER BY requested_at DESC LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}`),
  };
}
