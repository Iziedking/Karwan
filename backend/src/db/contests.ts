import type { Address, Hex } from 'viem';
import { pgEnabled, postgresExecutor } from './client.js';

/// Contests and their entries (view 40). A contest's prize is held on the job
/// escrow from the moment it opens; these rows say who entered with what, and
/// how it ended.

export type ContestStatus = 'opening' | 'open' | 'awarding' | 'awarded' | 'cancelled' | 'returned' | 'failed';
export type EntryStatus = 'entering' | 'in' | 'replaced' | 'won' | 'lost' | 'failed';

/// The kinds of contest (view 88): presets on one rule, the dates differ.
export type ContestKind = 'design' | 'bugs' | 'hackathon';

export interface Contest {
  id: string;
  /// Opened on the second job escrow (view 88): entrants are paid if the buyer
  /// picks nobody. Unset for contests on the first escrow, which keep the old
  /// rule (the prize goes back).
  protects?: boolean;
  kind?: ContestKind;
  /// Paid out by the contract after the wait, nobody having been picked.
  auto?: boolean;
  /// The contest's number on the job escrow, once opened.
  chainId?: string;
  /// The buyer's identity wallet, and the buying agent that holds the prize.
  buyer: Address;
  buyerAgent: Address;
  title: string;
  brief: string;
  tags: string[];
  prizeMicros: string;
  feeBps: number;
  /// Each place's share in basis points, first place first.
  shares: number[];
  /// Milliseconds.
  entriesBy: number;
  awardBy: number;
  status: ContestStatus;
  openTx?: string;
  awardTx?: string;
  refundTx?: string;
  winners?: { entryId: string; place: number; netMicros: string }[];
  backMicros?: string;
  /// The assistant conversation it was posted from, for the follow-ups.
  conversationId?: string;
  /// View 96: how many sellers it fits were told, who they were (never shown to
  /// anyone), and whether they had their one reminder before entries close.
  told?: number;
  toldTo?: Address[];
  reminded?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ContestEntry {
  id: string;
  contestId: string;
  seller: Address;
  sellerAgent: Address;
  note: string;
  previewId: string;
  files: number;
  fingerprint: Hex;
  status: EntryStatus;
  /// Marked not valid by the buyer (view 88), with the reason every entrant
  /// reads. A marked entry is never paid.
  notValid?: { reason: string; at: number; tx: string };
  enterTx?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContestsStore {
  get(id: string): Promise<Contest | null>;
  list(filter: { status?: ContestStatus[]; buyer?: string }): Promise<Contest[]>;
  create(c: Contest): Promise<void>;
  patch(id: string, patch: Partial<Contest>): Promise<Contest | null>;
  /// Applies the patch only while the contest is in one of `from`; null when it
  /// had already moved on, so a second tap never sends a second call.
  patchIfStatus(id: string, from: ContestStatus[], patch: Partial<Contest>): Promise<Contest | null>;
  entries(contestId: string): Promise<ContestEntry[]>;
  entry(id: string): Promise<ContestEntry | null>;
  liveEntryBy(contestId: string, seller: string): Promise<ContestEntry | null>;
  /// Contests this person entered and whose entry still stands, newest first (view 96).
  enteredBy(seller: string): Promise<Contest[]>;
  createEntry(e: ContestEntry): Promise<void>;
  patchEntry(id: string, patch: Partial<ContestEntry>): Promise<ContestEntry | null>;
}

const LIVE: EntryStatus[] = ['entering', 'in', 'won', 'lost'];
const lower = (a: string) => a.toLowerCase();

export function memoryContestsStore(): ContestsStore {
  const contests = new Map<string, Contest>();
  const entries = new Map<string, ContestEntry>();
  const copy = <T>(v: T): T => structuredClone(v);
  return {
    async get(id) {
      const c = contests.get(id);
      return c ? copy(c) : null;
    },
    async list(f) {
      return [...contests.values()]
        .filter((c) => (!f.status || f.status.includes(c.status)) && (!f.buyer || lower(c.buyer) === lower(f.buyer)))
        .map(copy);
    },
    async create(c) {
      contests.set(c.id, copy(c));
    },
    async patch(id, patch) {
      const c = contests.get(id);
      if (!c) return null;
      const next = { ...c, ...patch, updatedAt: Date.now() };
      contests.set(id, next);
      return copy(next);
    },
    async patchIfStatus(id, from, patch) {
      const c = contests.get(id);
      if (!c || !from.includes(c.status)) return null;
      return this.patch(id, patch);
    },
    async entries(contestId) {
      return [...entries.values()].filter((e) => e.contestId === contestId).map(copy);
    },
    async entry(id) {
      const e = entries.get(id);
      return e ? copy(e) : null;
    },
    async liveEntryBy(contestId, seller) {
      const e = [...entries.values()].find((x) => x.contestId === contestId && lower(x.seller) === lower(seller) && LIVE.includes(x.status));
      return e ? copy(e) : null;
    },
    async enteredBy(seller) {
      const ids = new Set([...entries.values()].filter((e) => lower(e.seller) === lower(seller) && LIVE.includes(e.status)).map((e) => e.contestId));
      return [...contests.values()].filter((c) => ids.has(c.id)).sort((a, b) => b.createdAt - a.createdAt).map(copy);
    },
    async createEntry(e) {
      entries.set(e.id, copy(e));
    },
    async patchEntry(id, patch) {
      const e = entries.get(id);
      if (!e) return null;
      const next = { ...e, ...patch, updatedAt: Date.now() };
      entries.set(id, next);
      return copy(next);
    },
  };
}

export function postgresContestsStore(): ContestsStore {
  const q = () => postgresExecutor();
  const one = <T>(rows: Array<{ data: unknown }>) => (rows[0]?.data as T | undefined) ?? null;
  return {
    async get(id) {
      return one<Contest>((await q().query('SELECT data FROM contests WHERE id = $1', [id])).rows as never);
    },
    async list(f) {
      const res = await q().query(
        `SELECT data FROM contests
         WHERE ($1::text[] IS NULL OR data->>'status' = ANY($1))
           AND ($2::text IS NULL OR lower(data->>'buyer') = lower($2))
         ORDER BY (data->>'createdAt')::bigint DESC LIMIT 500`,
        [f.status ?? null, f.buyer ?? null],
      );
      return res.rows.map((r) => r.data as Contest);
    },
    async create(c) {
      await q().query('INSERT INTO contests (id, data) VALUES ($1, $2)', [c.id, c]);
    },
    async patch(id, patch) {
      const res = await q().query(
        `UPDATE contests SET data = data || $2::jsonb || jsonb_build_object('updatedAt', $3::bigint) WHERE id = $1 RETURNING data`,
        [id, JSON.stringify(patch), Date.now()],
      );
      return one<Contest>(res.rows as never);
    },
    async patchIfStatus(id, from, patch) {
      const res = await q().query(
        `UPDATE contests SET data = data || $3::jsonb || jsonb_build_object('updatedAt', $4::bigint)
         WHERE id = $1 AND data->>'status' = ANY($2) RETURNING data`,
        [id, from, JSON.stringify(patch), Date.now()],
      );
      return one<Contest>(res.rows as never);
    },
    async entries(contestId) {
      const res = await q().query('SELECT data FROM contest_entries WHERE contest_id = $1 ORDER BY (data->>\'createdAt\')::bigint', [contestId]);
      return res.rows.map((r) => r.data as ContestEntry);
    },
    async entry(id) {
      return one<ContestEntry>((await q().query('SELECT data FROM contest_entries WHERE id = $1', [id])).rows as never);
    },
    async enteredBy(seller) {
      const res = await q().query(
        `SELECT c.data FROM contests c
         WHERE EXISTS (
           SELECT 1 FROM contest_entries e
           WHERE e.contest_id = c.id AND lower(e.data->>'seller') = lower($1) AND e.data->>'status' = ANY($2)
         )
         ORDER BY (c.data->>'createdAt')::bigint DESC LIMIT 100`,
        [seller, LIVE],
      );
      return res.rows.map((r) => r.data as Contest);
    },
    async liveEntryBy(contestId, seller) {
      const res = await q().query(
        `SELECT data FROM contest_entries WHERE contest_id = $1 AND lower(data->>'seller') = lower($2) AND data->>'status' = ANY($3) LIMIT 1`,
        [contestId, seller, LIVE],
      );
      return one<ContestEntry>(res.rows as never);
    },
    async createEntry(e) {
      await q().query('INSERT INTO contest_entries (id, contest_id, data) VALUES ($1, $2, $3)', [e.id, e.contestId, e]);
    },
    async patchEntry(id, patch) {
      const res = await q().query(
        `UPDATE contest_entries SET data = data || $2::jsonb || jsonb_build_object('updatedAt', $3::bigint) WHERE id = $1 RETURNING data`,
        [id, JSON.stringify(patch), Date.now()],
      );
      return one<ContestEntry>(res.rows as never);
    },
  };
}

export const contestsStore: ContestsStore = pgEnabled ? postgresContestsStore() : memoryContestsStore();
