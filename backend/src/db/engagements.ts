import type { Address, Hex } from 'viem';
import { pgEnabled, postgresExecutor } from './client.js';

/// Hourly work and monthly retainers on the time escrow (view 32). Each week
/// or month is funded on the escrow before it runs; these rows keep what the
/// two people agreed, the hours logged and how each week ended.

export type EngagementStatus = 'offering' | 'offered' | 'active' | 'ending' | 'closed' | 'cancelled' | 'declined' | 'failed';
export type WeekStatus = 'funded' | 'logged' | 'objected' | 'settled';

export interface StoredTimeTerms {
  asset: Hex;
  worker: Hex;
  rate: string;
  unitScale: number;
  maxUnits: number;
  cycleSecs: number;
  cycles: number;
  startsAt: string;
  acceptBy: string;
  claimGrace: number;
  reviewWindow: number;
  noticeCycles: number;
  rollover: boolean;
  partialBps: number;
  fallbackBps: number;
  agreementHash: Hex;
}

export interface EngagementWeek {
  k: number;
  fundedMicros: string;
  loggedMinutes: number;
  approvedMinutes: number;
  objectedMinutes: number;
  log: { at: number; minutes: number; note: string }[];
  status: WeekStatus;
  paidNetMicros?: string;
  backMicros?: string;
  reason?: string;
  objectedAt?: number;
  escalatedAt?: number;
  /// Reminders already sent for this week, so each goes once.
  reminded?: string[];
}

export interface Engagement {
  id: string;
  /// The engagement id on the time escrow, once offered.
  chainId?: Hex;
  salt: Hex;
  kind: 'hourly' | 'monthly';
  /// Identity wallets, and the agents that sign: the hirer's buying agent
  /// funds, the worker's selling agent accepts and logs.
  hirer: Address;
  hirerAgent: Address;
  worker: Address;
  workerAgent: Address;
  title: string;
  brief: string;
  rateMicros: string;
  /// Most hours a week; 1 for a monthly retainer.
  maxHours: number;
  periods: number;
  /// Milliseconds.
  startsAt: number;
  feeBps: number;
  termsHash: Hex;
  terms: StoredTimeTerms;
  status: EngagementStatus;
  weeks: EngagementWeek[];
  /// The request and offer it was hired from, when it came from the market.
  fromJob?: string;
  fromOffer?: string;
  noticeBy?: 'hirer' | 'worker';
  /// How many weeks or months run in the end, after notice.
  runs?: number;
  tx: Record<string, string>;
  reminded?: string[];
  conversationId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface EngagementsStore {
  get(id: string): Promise<Engagement | null>;
  create(e: Engagement): Promise<void>;
  patch(id: string, patch: Partial<Engagement>): Promise<Engagement | null>;
  /// Applies the patch only while the engagement is in one of `from`; null
  /// when it had already moved on, so a second tap never sends a second call.
  patchIfStatus(id: string, from: EngagementStatus[], patch: Partial<Engagement>): Promise<Engagement | null>;
  /// Every engagement this identity is the hirer or the worker of, newest first.
  listFor(user: string): Promise<Engagement[]>;
  /// Engagements the runner still has work on.
  listLive(): Promise<Engagement[]>;
  /// Whether this worker has finished an engagement with money paid.
  hasFinished(worker: string): Promise<boolean>;
}

const LIVE: EngagementStatus[] = ['offered', 'active', 'ending', 'declined'];
const lower = (a: string) => a.toLowerCase();
const paidSomething = (e: Engagement) => e.weeks.some((w) => BigInt(w.paidNetMicros ?? '0') > 0n);

export function memoryEngagementsStore(): EngagementsStore {
  const rows = new Map<string, Engagement>();
  const copy = <T>(v: T): T => structuredClone(v);
  const all = () => [...rows.values()].sort((a, b) => b.createdAt - a.createdAt);
  return {
    async get(id) {
      const e = rows.get(id);
      return e ? copy(e) : null;
    },
    async create(e) {
      rows.set(e.id, copy(e));
    },
    async patch(id, patch) {
      const e = rows.get(id);
      if (!e) return null;
      const next = { ...e, ...patch, updatedAt: Date.now() };
      rows.set(id, next);
      return copy(next);
    },
    async patchIfStatus(id, from, patch) {
      const e = rows.get(id);
      if (!e || !from.includes(e.status)) return null;
      return this.patch(id, patch);
    },
    async listFor(user) {
      return all().filter((e) => lower(e.hirer) === lower(user) || lower(e.worker) === lower(user)).map(copy);
    },
    async listLive() {
      return all().filter((e) => LIVE.includes(e.status)).map(copy);
    },
    async hasFinished(worker) {
      return all().some((e) => lower(e.worker) === lower(worker) && e.status === 'closed' && paidSomething(e));
    },
  };
}

export function postgresEngagementsStore(): EngagementsStore {
  const q = () => postgresExecutor();
  const one = (rows: Array<{ data: unknown }>) => (rows[0]?.data as Engagement | undefined) ?? null;
  return {
    async get(id) {
      return one((await q().query('SELECT data FROM engagements WHERE id = $1', [id])).rows as never);
    },
    async create(e) {
      await q().query('INSERT INTO engagements (id, data) VALUES ($1, $2)', [e.id, e]);
    },
    async patch(id, patch) {
      const res = await q().query(
        `UPDATE engagements SET data = data || $2::jsonb || jsonb_build_object('updatedAt', $3::bigint) WHERE id = $1 RETURNING data`,
        [id, JSON.stringify(patch), Date.now()],
      );
      return one(res.rows as never);
    },
    async patchIfStatus(id, from, patch) {
      const res = await q().query(
        `UPDATE engagements SET data = data || $3::jsonb || jsonb_build_object('updatedAt', $4::bigint)
         WHERE id = $1 AND data->>'status' = ANY($2) RETURNING data`,
        [id, from, JSON.stringify(patch), Date.now()],
      );
      return one(res.rows as never);
    },
    async listFor(user) {
      const res = await q().query(
        `SELECT data FROM engagements WHERE lower(data->>'hirer') = lower($1) OR lower(data->>'worker') = lower($1)
         ORDER BY (data->>'createdAt')::bigint DESC LIMIT 200`,
        [user],
      );
      return res.rows.map((r) => r.data as Engagement);
    },
    async listLive() {
      const res = await q().query(`SELECT data FROM engagements WHERE data->>'status' = ANY($1) LIMIT 1000`, [LIVE]);
      return res.rows.map((r) => r.data as Engagement);
    },
    async hasFinished(worker) {
      const res = await q().query(
        `SELECT data FROM engagements WHERE lower(data->>'worker') = lower($1) AND data->>'status' = 'closed' LIMIT 50`,
        [worker],
      );
      return res.rows.some((r) => paidSomething(r.data as Engagement));
    },
  };
}

export const engagementsStore: EngagementsStore = pgEnabled ? postgresEngagementsStore() : memoryEngagementsStore();
