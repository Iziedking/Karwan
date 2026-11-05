import { pgEnabled, postgresExecutor } from './client.js';

/// Outside-agent jobs on the job escrow (views 15 and 40): who paired with
/// World ID, the jobs their agents opened, and the one-time links a person
/// answers. Amounts are micro-USDC strings, times are milliseconds.

export interface AgentPairing {
  /// World AgentKit's key for the human behind the agent.
  humanKeyDigest: string;
  /// The World ID session the person created when pairing.
  worldSessionId: string;
  agentAddress: string;
  pairedAt: number;
}

export type AgentJobStatus = 'quoted' | 'created' | 'funded' | 'submitted' | 'completed' | 'rejected' | 'disputed' | 'refunded' | 'expired';

export interface AgentJob {
  ref: string;
  humanKeyDigest: string;
  /// The outside agent's wallet: the job's client on chain.
  agentAddress: string;
  sellerAccount: string;
  sellerTag: string;
  /// The seller's selling agent wallet: the job's provider on chain.
  provider: string;
  work: string;
  amountMicros: string;
  feeBps: number;
  expiredAt: number;
  chainId?: string;
  status: AgentJobStatus;
  submittedAt?: number;
  reviewEndsAt?: number;
  rejectedAt?: number;
  /// The seller's delivery note, and the person's line when not happy.
  deliveryNote?: string;
  unhappyNote?: string;
  /// Set once a day before the review window ends, so the agent reminds its person.
  remind?: boolean;
  tx: Partial<Record<'create' | 'fund' | 'submit' | 'complete' | 'reject' | 'dispute' | 'release' | 'refund', string>>;
  createdAt: number;
  updatedAt: number;
}

export type AgentTokenKind = 'pair' | 'release';

export interface AgentToken {
  /// sha256 of the token in the link; the token itself is never kept.
  hash: string;
  kind: AgentTokenKind;
  /// The human key digest for a pairing, the job ref for a release.
  subject: string;
  agentAddress: string;
  expiresAt: number;
  usedAt?: number;
}

export interface AgentJobsStore {
  pairing(humanKeyDigest: string): Promise<AgentPairing | null>;
  pairingBySession(sessionId: string): Promise<AgentPairing | null>;
  /// False when the session is already paired to another human key.
  savePairing(p: AgentPairing): Promise<boolean>;
  createJob(j: AgentJob): Promise<void>;
  job(ref: string): Promise<AgentJob | null>;
  jobByChainId(chainId: string): Promise<AgentJob | null>;
  /// Applies the patch only while the job is in one of `from`; null when it
  /// had already moved on.
  patchJob(ref: string, patch: Partial<AgentJob>, from?: AgentJobStatus[]): Promise<AgentJob | null>;
  jobsForSeller(account: string): Promise<AgentJob[]>;
  jobsWithStatus(status: AgentJobStatus[]): Promise<AgentJob[]>;
  putToken(t: AgentToken): Promise<void>;
  peekToken(hash: string, kind: AgentTokenKind, now: number): Promise<AgentToken | null>;
  /// Marks the token used and returns it, once; null when used, expired or unknown.
  takeToken(hash: string, kind: AgentTokenKind, now: number): Promise<AgentToken | null>;
}

const lower = (a: string) => a.toLowerCase();

export function memoryAgentJobsStore(): AgentJobsStore {
  const pairings = new Map<string, AgentPairing>();
  const jobs = new Map<string, AgentJob>();
  const tokens = new Map<string, AgentToken>();
  const copy = <T>(v: T): T => structuredClone(v);
  const live = (t: AgentToken | undefined, kind: AgentTokenKind, now: number) => !!t && t.kind === kind && !t.usedAt && t.expiresAt > now;
  return {
    async pairing(d) {
      const p = pairings.get(d);
      return p ? copy(p) : null;
    },
    async pairingBySession(n) {
      const p = [...pairings.values()].find((x) => x.worldSessionId === n);
      return p ? copy(p) : null;
    },
    async savePairing(p) {
      const other = [...pairings.values()].find((x) => x.worldSessionId === p.worldSessionId && x.humanKeyDigest !== p.humanKeyDigest);
      const mine = pairings.get(p.humanKeyDigest);
      if (other || (mine && mine.worldSessionId !== p.worldSessionId)) return false;
      pairings.set(p.humanKeyDigest, copy(p));
      return true;
    },
    async createJob(j) {
      jobs.set(j.ref, copy(j));
    },
    async job(ref) {
      const j = jobs.get(ref);
      return j ? copy(j) : null;
    },
    async jobByChainId(chainId) {
      const j = [...jobs.values()].find((x) => x.chainId === chainId);
      return j ? copy(j) : null;
    },
    async patchJob(ref, patch, from) {
      const j = jobs.get(ref);
      if (!j || (from && !from.includes(j.status))) return null;
      const next = { ...j, ...patch, tx: { ...j.tx, ...patch.tx }, updatedAt: Date.now() };
      jobs.set(ref, next);
      return copy(next);
    },
    async jobsForSeller(account) {
      return [...jobs.values()].filter((j) => lower(j.sellerAccount) === lower(account)).sort((a, b) => b.createdAt - a.createdAt).map(copy);
    },
    async jobsWithStatus(status) {
      return [...jobs.values()].filter((j) => status.includes(j.status)).map(copy);
    },
    async putToken(t) {
      tokens.set(t.hash, copy(t));
    },
    async peekToken(hash, kind, now) {
      const t = tokens.get(hash);
      return live(t, kind, now) ? copy(t!) : null;
    },
    async takeToken(hash, kind, now) {
      const t = tokens.get(hash);
      if (!live(t, kind, now)) return null;
      t!.usedAt = now;
      return copy(t!);
    },
  };
}

export function postgresAgentJobsStore(): AgentJobsStore {
  const q = () => postgresExecutor();
  const one = <T>(rows: Array<{ data: unknown }>) => (rows[0]?.data as T | undefined) ?? null;
  return {
    async pairing(d) {
      return one<AgentPairing>((await q().query('SELECT data FROM agent_pairings WHERE human_key_digest = $1', [d])).rows as never);
    },
    async pairingBySession(n) {
      return one<AgentPairing>((await q().query('SELECT data FROM agent_pairings WHERE world_session_id = $1', [n])).rows as never);
    },
    async savePairing(p) {
      const res = await q().query(
        `INSERT INTO agent_pairings (human_key_digest, world_session_id, data) VALUES ($1, $2, $3)
         ON CONFLICT (human_key_digest) DO UPDATE SET data = EXCLUDED.data
           WHERE agent_pairings.world_session_id = EXCLUDED.world_session_id
         RETURNING 1`,
        [p.humanKeyDigest, p.worldSessionId, p],
      ).catch((e: { code?: string }) => {
        if (e.code === '23505') return { rows: [] };
        throw e;
      });
      return res.rows.length > 0;
    },
    async createJob(j) {
      await q().query('INSERT INTO agent_jobs (ref, data) VALUES ($1, $2)', [j.ref, j]);
    },
    async job(ref) {
      return one<AgentJob>((await q().query('SELECT data FROM agent_jobs WHERE ref = $1', [ref])).rows as never);
    },
    async jobByChainId(chainId) {
      return one<AgentJob>((await q().query(`SELECT data FROM agent_jobs WHERE data->>'chainId' = $1`, [chainId])).rows as never);
    },
    async patchJob(ref, patch, from) {
      const { tx, ...rest } = patch;
      const res = await q().query(
        `UPDATE agent_jobs
         SET data = data || $2::jsonb || jsonb_build_object('tx', coalesce(data->'tx', '{}'::jsonb) || $3::jsonb, 'updatedAt', $4::bigint)
         WHERE ref = $1 AND ($5::text[] IS NULL OR data->>'status' = ANY($5))
         RETURNING data`,
        [ref, JSON.stringify(rest), JSON.stringify(tx ?? {}), Date.now(), from ?? null],
      );
      return one<AgentJob>(res.rows as never);
    },
    async jobsForSeller(account) {
      const res = await q().query(
        `SELECT data FROM agent_jobs WHERE lower(data->>'sellerAccount') = lower($1) ORDER BY (data->>'createdAt')::bigint DESC LIMIT 200`,
        [account],
      );
      return res.rows.map((r) => r.data as AgentJob);
    },
    async jobsWithStatus(status) {
      const res = await q().query(`SELECT data FROM agent_jobs WHERE data->>'status' = ANY($1) LIMIT 1000`, [status]);
      return res.rows.map((r) => r.data as AgentJob);
    },
    async putToken(t) {
      await q().query('INSERT INTO agent_tokens (hash, data) VALUES ($1, $2)', [t.hash, t]);
    },
    async peekToken(hash, kind, now) {
      const res = await q().query(
        `SELECT data FROM agent_tokens WHERE hash = $1 AND data->>'kind' = $2 AND NOT (data ? 'usedAt') AND (data->>'expiresAt')::bigint > $3`,
        [hash, kind, now],
      );
      return one<AgentToken>(res.rows as never);
    },
    async takeToken(hash, kind, now) {
      const res = await q().query(
        `UPDATE agent_tokens SET data = data || jsonb_build_object('usedAt', $3::bigint)
         WHERE hash = $1 AND data->>'kind' = $2 AND NOT (data ? 'usedAt') AND (data->>'expiresAt')::bigint > $3
         RETURNING data`,
        [hash, kind, now],
      );
      return one<AgentToken>(res.rows as never);
    },
  };
}

export const agentJobsStore: AgentJobsStore = pgEnabled ? postgresAgentJobsStore() : memoryAgentJobsStore();
