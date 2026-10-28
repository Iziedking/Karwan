import type { Hex } from 'viem';
import type { SqlExecutor } from '../db/migrations.js';
import { fingerprint } from './shared/canonical.js';
import { parsePolicy } from './shared/policy.js';
import { referenceSchema } from './shared/reference.js';
import { EVIDENCE_VERSION } from './shared/evidence.js';

/// Karwan's side of the CRE workflows: an index that says where to look and
/// documents served by fingerprint. Nothing here is trusted by a workflow; it
/// re-checks every document against Arc before using it.
export type DocKind = 'policy' | 'reference' | 'evidence' | 'dry-run';

export interface CheckItem {
  dealKey: string;
  kind: 'deal' | 'dry';
  family: string;
  dealId: string;
  revision: number;
  deliveredBlockHash: string | null;
  /// The workflow finds the Delivered log by block number, then checks the hash.
  deliveredBlockNumber: number | null;
  policyHash: string;
  referenceHash: string | null;
}

export interface ShadowRow {
  dealKey: string;
  revision: number;
  family: string;
  creVerdict: string;
  karwanVerdict: string | null;
  evidenceHash: string | null;
}

export interface WatchItem {
  kind: 'agreement' | 'time' | 'job';
  family: string;
  id: string;
  suggest?: { signature: string; args: string }[];
}

export interface CreStore {
  putDocument(kind: DocKind, body: unknown): Promise<Hex>;
  getDocument(hash: string): Promise<{ kind: DocKind; body: unknown } | null>;
  upsertCheckItem(item: CheckItem, nowMs: number): Promise<void>;
  /// A page that depends only on the cursor: every DON node asks with the
  /// same cursor (from DON time) and must get the same items, so reading never
  /// changes the index. The cursor rotates the start, so one slow replay
  /// cannot starve the rest. Items older than a day leave the index.
  pendingCheckItems(limit: number, nowMs: number, cursor: number): Promise<CheckItem[]>;
  closeCheckItem(dealKey: string, outcome: unknown, nowMs: number): Promise<void>;
  checkOutcome(dealKey: string): Promise<unknown | null>;
  recordShadow(row: ShadowRow, nowMs: number): Promise<void>;
  shadowSummary(): Promise<{ compared: number; agreed: number; disagreements: ShadowRow[] }>;
  /// True the first time a DON report is seen, false on every replay.
  markReport(reportHash: string, nowMs: number): Promise<boolean>;
  putDryRun(dryRunId: string, result: unknown, nowMs: number): Promise<void>;
  getDryRun(dryRunId: string): Promise<{ result: unknown; at: number } | null>;
  watch(item: WatchItem, nowMs: number): Promise<void>;
  unwatch(family: string, id: string): Promise<void>;
  watched(limit: number, cursor: number): Promise<WatchItem[]>;
}

export const CHECK_ITEM_TTL_MS = 86_400_000;
const PAGE_SCAN = 500;

function rotate<T>(rows: T[], limit: number, cursor: number): T[] {
  if (rows.length === 0) return [];
  const start = ((Math.floor(cursor) % rows.length) + rows.length) % rows.length;
  return [...rows.slice(start), ...rows.slice(0, start)].slice(0, limit);
}

export function validateDocument(kind: DocKind, body: unknown): void {
  if (kind === 'policy') parsePolicy(body, { partialAllowed: true });
  else if (kind === 'reference') referenceSchema.parse(body);
  else if (kind === 'evidence') {
    if ((body as { version?: unknown } | null)?.version !== EVIDENCE_VERSION) throw new Error('CRE_EVIDENCE_VERSION');
  } else if (body === null || typeof body !== 'object') throw new Error('CRE_DOCUMENT_SHAPE');
}

export function createMemoryCreStore(): CreStore {
  const docs = new Map<string, { kind: DocKind; body: unknown }>();
  const items = new Map<string, CheckItem & { state: 'pending' | 'closed'; createdAt: number; servedAt: number; outcome?: unknown }>();
  const shadow = new Map<string, ShadowRow>();
  const dry = new Map<string, { result: unknown; at: number }>();
  const seen = new Set<string>();
  const watches = new Map<string, WatchItem & { since: number }>();
  const watchKey = (family: string, id: string) => `${family.toLowerCase()}:${id.toLowerCase()}`;

  return {
    async putDocument(kind, body) {
      validateDocument(kind, body);
      const hash = fingerprint(body);
      docs.set(hash, { kind, body });
      return hash;
    },
    async getDocument(hash) {
      return docs.get(hash.toLowerCase()) ?? null;
    },
    async upsertCheckItem(item, nowMs) {
      const prior = items.get(item.dealKey);
      items.set(item.dealKey, { ...item, state: 'pending', createdAt: prior?.createdAt ?? nowMs, servedAt: prior?.servedAt ?? nowMs });
    },
    async pendingCheckItems(limit, nowMs, cursor) {
      const live = [...items.values()]
        .filter((i) => i.state === 'pending' && nowMs - i.createdAt <= CHECK_ITEM_TTL_MS)
        .sort((a, b) => a.createdAt - b.createdAt || a.dealKey.localeCompare(b.dealKey));
      return rotate(live, limit, cursor).map(({ state: _s, createdAt: _c, servedAt: _v, outcome: _o, ...item }) => item);
    },
    async closeCheckItem(dealKey, outcome) {
      const i = items.get(dealKey);
      if (i) Object.assign(i, { state: 'closed', outcome });
    },
    async checkOutcome(dealKey) {
      const i = items.get(dealKey);
      return i?.state === 'closed' ? (i.outcome ?? null) : null;
    },
    async recordShadow(row) {
      const prior = shadow.get(row.dealKey);
      shadow.set(row.dealKey, { ...row, karwanVerdict: row.karwanVerdict ?? prior?.karwanVerdict ?? null });
    },
    async shadowSummary() {
      const rows = [...shadow.values()].filter((r) => r.karwanVerdict !== null);
      const disagreements = rows.filter((r) => r.creVerdict !== r.karwanVerdict);
      return { compared: rows.length, agreed: rows.length - disagreements.length, disagreements };
    },
    async markReport(reportHash) {
      if (seen.has(reportHash)) return false;
      seen.add(reportHash);
      return true;
    },
    async putDryRun(dryRunId, result, nowMs) {
      dry.set(dryRunId, { result, at: nowMs });
    },
    async getDryRun(dryRunId) {
      return dry.get(dryRunId) ?? null;
    },
    async watch(item, nowMs) {
      const key = watchKey(item.family, item.id);
      watches.set(key, { ...item, since: watches.get(key)?.since ?? nowMs });
    },
    async unwatch(family, id) {
      watches.delete(watchKey(family, id));
    },
    async watched(limit, cursor) {
      const all = [...watches.values()].sort((a, b) => a.since - b.since || `${a.family}:${a.id}`.localeCompare(`${b.family}:${b.id}`));
      return rotate(all, limit, cursor).map(({ since: _s, ...w }) => w);
    },
  };
}

/// Postgres tables for the store, run as numbered migration 48 in
/// db/migrations.ts; kept here so the CRE module is whole.
export const CRE_STORE_SQL = `
CREATE TABLE cre_documents_v1 (
  hash TEXT PRIMARY KEY CHECK (hash ~ '^0x[0-9a-f]{64}$'),
  kind TEXT NOT NULL CHECK (kind IN ('policy', 'reference', 'evidence', 'dry-run')),
  body JSONB NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE cre_check_items_v1 (
  deal_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('deal', 'dry')),
  family TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  delivered_block_hash TEXT,
  delivered_block_number BIGINT CHECK (delivered_block_number >= 0),
  policy_hash TEXT NOT NULL,
  reference_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'closed')),
  outcome JSONB,
  created_at BIGINT NOT NULL,
  served_at BIGINT NOT NULL
);
CREATE INDEX cre_check_items_pending ON cre_check_items_v1 (served_at, deal_key) WHERE state = 'pending';
CREATE TABLE cre_shadow_results_v1 (
  deal_key TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  family TEXT NOT NULL,
  cre_verdict TEXT NOT NULL,
  karwan_verdict TEXT,
  evidence_hash TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE cre_seen_reports_v1 (
  report_hash TEXT PRIMARY KEY,
  seen_at BIGINT NOT NULL
);
CREATE TABLE cre_dry_runs_v1 (
  dry_run_id TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE cre_watch_v1 (
  family TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('agreement', 'time', 'job')),
  suggest JSONB,
  since BIGINT NOT NULL,
  PRIMARY KEY (family, id)
);
`;

export function createSqlCreStore(sql: SqlExecutor): CreStore {
  return {
    async putDocument(kind, body) {
      validateDocument(kind, body);
      const hash = fingerprint(body);
      await sql.query(
        'INSERT INTO cre_documents_v1 (hash, kind, body, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (hash) DO NOTHING',
        [hash, kind, JSON.stringify(body), Date.now()],
      );
      return hash;
    },
    async getDocument(hash) {
      const r = await sql.query<{ kind: DocKind; body: unknown }>('SELECT kind, body FROM cre_documents_v1 WHERE hash = $1', [hash.toLowerCase()]);
      return r.rows[0] ?? null;
    },
    async upsertCheckItem(i, nowMs) {
      await sql.query(
        `INSERT INTO cre_check_items_v1 (deal_key, kind, family, deal_id, revision, delivered_block_hash, delivered_block_number, policy_hash, reference_hash, state, created_at, served_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $10)
         ON CONFLICT (deal_key) DO UPDATE SET state = 'pending', delivered_block_hash = EXCLUDED.delivered_block_hash,
           delivered_block_number = EXCLUDED.delivered_block_number,
           policy_hash = EXCLUDED.policy_hash, reference_hash = EXCLUDED.reference_hash`,
        [i.dealKey, i.kind, i.family, i.dealId, i.revision, i.deliveredBlockHash, i.deliveredBlockNumber, i.policyHash, i.referenceHash, nowMs],
      );
    },
    async pendingCheckItems(limit, nowMs, cursor) {
      const r = await sql.query<{
        deal_key: string; kind: 'deal' | 'dry'; family: string; deal_id: string; revision: number;
        delivered_block_hash: string | null; delivered_block_number: string | number | null; policy_hash: string; reference_hash: string | null;
      }>(
        `SELECT deal_key, kind, family, deal_id, revision, delivered_block_hash, delivered_block_number, policy_hash, reference_hash
         FROM cre_check_items_v1 WHERE state = 'pending' AND $2 - created_at <= $1
         ORDER BY created_at, deal_key LIMIT $3`,
        [CHECK_ITEM_TTL_MS, nowMs, PAGE_SCAN],
      );
      return rotate(r.rows, limit, cursor).map((row) => ({
        dealKey: row.deal_key, kind: row.kind, family: row.family, dealId: row.deal_id, revision: Number(row.revision),
        deliveredBlockHash: row.delivered_block_hash,
        deliveredBlockNumber: row.delivered_block_number === null ? null : Number(row.delivered_block_number),
        policyHash: row.policy_hash, referenceHash: row.reference_hash,
      }));
    },
    async closeCheckItem(dealKey, outcome) {
      await sql.query(`UPDATE cre_check_items_v1 SET state = 'closed', outcome = $2 WHERE deal_key = $1`, [dealKey, JSON.stringify(outcome)]);
    },
    async checkOutcome(dealKey) {
      const r = await sql.query<{ outcome: unknown }>(`SELECT outcome FROM cre_check_items_v1 WHERE deal_key = $1 AND state = 'closed'`, [dealKey]);
      return r.rows[0]?.outcome ?? null;
    },
    async recordShadow(row, nowMs) {
      await sql.query(
        `INSERT INTO cre_shadow_results_v1 (deal_key, revision, family, cre_verdict, karwan_verdict, evidence_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (deal_key) DO UPDATE SET cre_verdict = EXCLUDED.cre_verdict,
           karwan_verdict = COALESCE(EXCLUDED.karwan_verdict, cre_shadow_results_v1.karwan_verdict), evidence_hash = EXCLUDED.evidence_hash`,
        [row.dealKey, row.revision, row.family, row.creVerdict, row.karwanVerdict, row.evidenceHash, nowMs],
      );
    },
    async shadowSummary() {
      const r = await sql.query<{ deal_key: string; revision: number; family: string; cre_verdict: string; karwan_verdict: string; evidence_hash: string | null }>(
        'SELECT deal_key, revision, family, cre_verdict, karwan_verdict, evidence_hash FROM cre_shadow_results_v1 WHERE karwan_verdict IS NOT NULL',
      );
      const rows: ShadowRow[] = r.rows.map((x) => ({
        dealKey: x.deal_key, revision: Number(x.revision), family: x.family, creVerdict: x.cre_verdict, karwanVerdict: x.karwan_verdict, evidenceHash: x.evidence_hash,
      }));
      const disagreements = rows.filter((x) => x.creVerdict !== x.karwanVerdict);
      return { compared: rows.length, agreed: rows.length - disagreements.length, disagreements };
    },
    async markReport(reportHash, nowMs) {
      const r = await sql.query('INSERT INTO cre_seen_reports_v1 (report_hash, seen_at) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING report_hash', [reportHash, nowMs]);
      return r.rows.length === 1;
    },
    async putDryRun(dryRunId, result, nowMs) {
      await sql.query(
        'INSERT INTO cre_dry_runs_v1 (dry_run_id, result, created_at) VALUES ($1, $2, $3) ON CONFLICT (dry_run_id) DO UPDATE SET result = EXCLUDED.result',
        [dryRunId, JSON.stringify(result), nowMs],
      );
    },
    async getDryRun(dryRunId) {
      const r = await sql.query<{ result: unknown; created_at: number }>('SELECT result, created_at FROM cre_dry_runs_v1 WHERE dry_run_id = $1', [dryRunId]);
      const row = r.rows[0];
      return row ? { result: row.result, at: Number(row.created_at) } : null;
    },
    async watch(item, nowMs) {
      await sql.query(
        `INSERT INTO cre_watch_v1 (family, id, kind, suggest, since) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (family, id) DO UPDATE SET suggest = EXCLUDED.suggest`,
        [item.family.toLowerCase(), item.id.toLowerCase(), item.kind, item.suggest ? JSON.stringify(item.suggest) : null, nowMs],
      );
    },
    async unwatch(family, id) {
      await sql.query('DELETE FROM cre_watch_v1 WHERE family = $1 AND id = $2', [family.toLowerCase(), id.toLowerCase()]);
    },
    async watched(limit, cursor) {
      const r = await sql.query<{ family: string; id: string; kind: WatchItem['kind']; suggest: WatchItem['suggest'] | null }>(
        'SELECT family, id, kind, suggest FROM cre_watch_v1 ORDER BY since, family, id LIMIT $1',
        [PAGE_SCAN],
      );
      return rotate(r.rows, limit, cursor).map((x) => (x.suggest ? { kind: x.kind, family: x.family, id: x.id, suggest: x.suggest } : { kind: x.kind, family: x.family, id: x.id }));
    },
  };
}
