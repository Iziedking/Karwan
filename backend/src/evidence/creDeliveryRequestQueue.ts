import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  creDeliveryRequestKey,
  type CreDeliveryRequest,
  type CreEvidenceReceiptBinding,
  publicCreDeliveryRequest,
} from './creDeliveryRequest.js';
import type { SqlExecutor } from '../db/migrations.js';

export type CreDeliveryRequestState = 'pending' | 'leased' | 'completed' | 'expired' | 'cancelled';

export interface CreDeliveryRequestRecord extends CreDeliveryRequest {
  requestKey: string;
  state: CreDeliveryRequestState;
  leaseToken?: string;
  leaseExpiresAt?: number;
  receipt?: CreEvidenceReceiptBinding;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export type CreQueueResult<T> =
  | { ok: true; value: T; idempotent?: boolean }
  | { ok: false; code: 'REQUEST_CONFLICT' | 'REQUEST_NOT_FOUND' | 'REQUEST_NOT_CLAIMED' | 'REQUEST_EXPIRED' | 'REQUEST_CANCELLED' | 'RECEIPT_CONFLICT'; message: string };

export interface CreClaimResult {
  record: CreDeliveryRequestRecord;
}

async function postgresRuntime(): Promise<typeof import('../db/client.js')> {
  return import('../db/client.js');
}

export type CreDeliveryRequestQueueTransaction = <T>(
  operation: (executor: SqlExecutor) => Promise<T>,
) => Promise<T>;

export interface CreDeliveryRequestQueueSqlRuntime {
  withTransaction: CreDeliveryRequestQueueTransaction;
}

const FLAT_STORE_PATH = resolve(process.cwd(), 'data', 'cre-delivery-requests.json');
let flatStoreLock = Promise.resolve();

function samePublicRequest(left: CreDeliveryRequest, right: CreDeliveryRequest): boolean {
  return JSON.stringify(publicCreDeliveryRequest(left)) === JSON.stringify(publicCreDeliveryRequest(right));
}

function nowSeconds(nowMs: number): number {
  return Math.floor(nowMs / 1_000);
}

function normalizeRecord(record: CreDeliveryRequestRecord): CreDeliveryRequestRecord {
  return {
    ...record,
    dealId: record.dealId.toLowerCase() as `0x${string}`,
    submittedSha: record.submittedSha.toLowerCase(),
  };
}

function expireFlatRecords(records: Map<string, CreDeliveryRequestRecord>, nowMs: number): void {
  const seconds = nowSeconds(nowMs);
  for (const [key, record] of records) {
    if ((record.state === 'pending' || record.state === 'leased') && record.expiresAt <= seconds) {
      records.set(key, { ...record, state: 'expired', leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: nowMs });
    } else if (record.state === 'leased' && (record.leaseExpiresAt ?? 0) <= nowMs) {
      records.set(key, { ...record, state: 'pending', leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: nowMs });
    }
  }
}

function readFlatRecords(): Map<string, CreDeliveryRequestRecord> {
  if (!existsSync(FLAT_STORE_PATH)) return new Map();
  try {
    const parsed = JSON.parse(readFileSync(FLAT_STORE_PATH, 'utf8')) as Record<string, CreDeliveryRequestRecord>;
    return new Map(Object.entries(parsed).map(([key, value]) => [key, normalizeRecord(value)]));
  } catch {
    return new Map();
  }
}

function writeFlatRecords(records: Map<string, CreDeliveryRequestRecord>): void {
  const directory = dirname(FLAT_STORE_PATH);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  const temporaryPath = `${FLAT_STORE_PATH}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(Object.fromEntries(records), null, 2), 'utf8');
  renameSync(temporaryPath, FLAT_STORE_PATH);
}

async function withFlatStore<T>(operation: () => Promise<T> | T): Promise<T> {
  const previous = flatStoreLock;
  let release: () => void = () => undefined;
  flatStoreLock = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function rowToRecord(row: QueueRow): CreDeliveryRequestRecord {
  return normalizeRecord({
    requestKey: row.request_key,
    dealId: row.deal_id as `0x${string}`,
    termsVersion: Number(row.terms_version),
    evidenceRevision: Number(row.evidence_revision),
    expiresAt: Number(row.expires_at),
    pullNumber: Number(row.pull_number),
    submittedSha: row.submitted_sha,
    publishedAt: Number(row.created_at),
    state: row.state as CreDeliveryRequestState,
    ...(row.lease_token ? { leaseToken: row.lease_token } : {}),
    ...(row.lease_expires_at == null ? {} : { leaseExpiresAt: Number(row.lease_expires_at) }),
    ...(row.receipt ? { receipt: row.receipt } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.completed_at == null ? {} : { completedAt: Number(row.completed_at) }),
  });
}

interface QueueRow extends Record<string, unknown> {
  request_key: string;
  deal_id: string;
  terms_version: number | string;
  evidence_revision: number | string;
  expires_at: number | string;
  pull_number: number | string;
  submitted_sha: string;
  state: string;
  lease_token: string | null;
  lease_expires_at: number | string | null;
  receipt: CreEvidenceReceiptBinding | null;
  created_at: number | string;
  updated_at: number | string;
  completed_at: number | string | null;
}

export class PostgresCreDeliveryRequestQueue {
  constructor(private readonly sql: CreDeliveryRequestQueueSqlRuntime) {}

  publish(request: CreDeliveryRequest, nowMs = Date.now()): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
    return publishPostgres(this.sql, request, nowMs);
  }

  adoptLegacy(request: CreDeliveryRequest, nowMs = Date.now()): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
    return this.publish(request, nowMs);
  }

  claim(requestKeys: readonly string[], nowMs = Date.now(), leaseMs = 90_000): Promise<CreClaimResult | null> {
    return claimPostgres(this.sql, requestKeys, nowMs, leaseMs);
  }

  complete(
    request: CreDeliveryRequest,
    receipt: CreEvidenceReceiptBinding,
    nowMs = Date.now(),
  ): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
    return completePostgres(this.sql, request, receipt, nowMs);
  }

  cancel(dealId: string, nowMs = Date.now()): Promise<number> {
    return cancelPostgres(this.sql, dealId, nowMs);
  }
}

function activeRevisionRecord(records: Iterable<CreDeliveryRequestRecord>, request: CreDeliveryRequest): CreDeliveryRequestRecord | undefined {
  return [...records]
    .filter((record) => record.dealId.toLowerCase() === request.dealId.toLowerCase())
    .filter((record) => record.termsVersion === request.termsVersion)
    .filter((record) => record.evidenceRevision === request.evidenceRevision)
    .filter((record) => record.state === 'pending' || record.state === 'leased')
    .sort((left, right) => left.createdAt - right.createdAt || left.requestKey.localeCompare(right.requestKey))[0];
}

/// Deterministic local queue used by preview mode and by the queue contract
/// tests. The production functions below use the same transitions against
/// Postgres or the durable flat-file fallback.
export class InMemoryCreDeliveryRequestQueue {
  private readonly records = new Map<string, CreDeliveryRequestRecord>();

  publish(request: CreDeliveryRequest, nowMs = Date.now()): CreQueueResult<CreDeliveryRequestRecord> {
    expireFlatRecords(this.records, nowMs);
    const active = activeRevisionRecord(this.records.values(), request);
    if (active) {
      return samePublicRequest(active, request)
        ? { ok: true, value: active, idempotent: true }
        : { ok: false, code: 'REQUEST_CONFLICT', message: 'a different active request already exists for this delivery revision' };
    }
    const key = creDeliveryRequestKey(request);
    const existing = this.records.get(key);
    if (existing) {
      return samePublicRequest(existing, request)
        ? { ok: true, value: existing, idempotent: true }
        : { ok: false, code: 'REQUEST_CONFLICT', message: 'request identity is already bound to different data' };
    }
    const record: CreDeliveryRequestRecord = {
      ...request,
      requestKey: key,
      state: 'pending',
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    this.records.set(key, record);
    return { ok: true, value: record, idempotent: false };
  }

  adoptLegacy(request: CreDeliveryRequest, nowMs = Date.now()): CreQueueResult<CreDeliveryRequestRecord> {
    return this.publish(request, nowMs);
  }

  claim(requestKeys: readonly string[], nowMs = Date.now(), leaseMs = 90_000): CreClaimResult | null {
    expireFlatRecords(this.records, nowMs);
    const next = [...this.records.values()]
      .filter((record) => requestKeys.includes(record.requestKey))
      .filter((record) => record.state === 'pending' && record.expiresAt > nowSeconds(nowMs))
      .sort((left, right) => left.createdAt - right.createdAt || left.requestKey.localeCompare(right.requestKey))[0];
    if (!next) return null;
    const claimed: CreDeliveryRequestRecord = {
      ...next,
      state: 'leased',
      leaseToken: randomUUID(),
      leaseExpiresAt: nowMs + leaseMs,
      updatedAt: nowMs,
    };
    this.records.set(next.requestKey, claimed);
    return { record: claimed };
  }

  complete(request: CreDeliveryRequest, receipt: CreEvidenceReceiptBinding, nowMs = Date.now()): CreQueueResult<CreDeliveryRequestRecord> {
    const key = creDeliveryRequestKey(request);
    const leased = this.records.get(key);
    if (leased?.state === 'leased' && (leased.leaseExpiresAt ?? 0) <= nowMs) {
      this.records.set(key, {
        ...leased,
        state: leased.expiresAt <= nowSeconds(nowMs) ? 'expired' : 'pending',
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: nowMs,
      });
      return { ok: false, code: 'REQUEST_EXPIRED', message: 'the delivery request lease has elapsed' };
    }
    expireFlatRecords(this.records, nowMs);
    const existing = this.records.get(key);
    if (!existing) return { ok: false, code: 'REQUEST_NOT_FOUND', message: 'the delivery request is not in the durable queue' };
    if (existing.state === 'cancelled') return { ok: false, code: 'REQUEST_CANCELLED', message: 'the delivery request was cancelled by a newer delivery' };
    if (existing.state === 'expired') return { ok: false, code: 'REQUEST_EXPIRED', message: 'the delivery request lease or expiry has elapsed' };
    if (existing.state === 'completed') {
      return existing.receipt && sameReceipt(existing.receipt, receipt)
        ? { ok: true, value: existing, idempotent: true }
        : { ok: false, code: 'RECEIPT_CONFLICT', message: 'a different receipt is already bound to this request' };
    }
    if (existing.state !== 'leased') return { ok: false, code: 'REQUEST_NOT_CLAIMED', message: 'claim the delivery request before posting its receipt' };
    if ((existing.leaseExpiresAt ?? 0) <= nowMs) return { ok: false, code: 'REQUEST_EXPIRED', message: 'the delivery request lease has elapsed' };
    const completed: CreDeliveryRequestRecord = {
      ...existing,
      state: 'completed',
      receipt,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      completedAt: nowMs,
      updatedAt: nowMs,
    };
    this.records.set(key, completed);
    return { ok: true, value: completed, idempotent: false };
  }

  cancel(dealId: string, nowMs = Date.now()): number {
    let cancelled = 0;
    for (const [key, record] of this.records) {
      if (record.dealId.toLowerCase() !== dealId.toLowerCase()) continue;
      if (record.state !== 'pending' && record.state !== 'leased') continue;
      this.records.set(key, { ...record, state: 'cancelled', leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: nowMs });
      cancelled += 1;
    }
    return cancelled;
  }

  get(requestKey: string): CreDeliveryRequestRecord | undefined {
    return this.records.get(requestKey);
  }
}

function publishFlat(request: CreDeliveryRequest, nowMs: number): CreQueueResult<CreDeliveryRequestRecord> {
  const records = readFlatRecords();
  expireFlatRecords(records, nowMs);
  const active = activeRevisionRecord(records.values(), request);
  if (active) {
    if (!samePublicRequest(active, request)) {
      writeFlatRecords(records);
      return { ok: false, code: 'REQUEST_CONFLICT', message: 'a different active request already exists for this delivery revision' };
    }
    writeFlatRecords(records);
    return { ok: true, value: active, idempotent: true };
  }
  const key = creDeliveryRequestKey(request);
  const existing = records.get(key);
  if (existing) {
    if (!samePublicRequest(existing, request)) {
      writeFlatRecords(records);
      return { ok: false, code: 'REQUEST_CONFLICT', message: 'request identity is already bound to different data' };
    }
    writeFlatRecords(records);
    return { ok: true, value: existing, idempotent: true };
  }
  const record: CreDeliveryRequestRecord = {
    ...request,
    requestKey: key,
    state: 'pending',
    createdAt: nowMs,
    updatedAt: nowMs,
  };
  records.set(key, record);
  writeFlatRecords(records);
  return { ok: true, value: record, idempotent: false };
}

async function publishPostgres(
  sql: CreDeliveryRequestQueueSqlRuntime,
  request: CreDeliveryRequest,
  nowMs: number,
): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
  return sql.withTransaction(async (tx) => {
    const seconds = nowSeconds(nowMs);
    await tx.query(
      `UPDATE cre_delivery_requests_v1
       SET state = 'expired', lease_token = NULL, lease_expires_at = NULL, updated_at = $1
       WHERE state IN ('pending', 'leased') AND expires_at <= $2`,
      [nowMs, seconds],
    );
    const active = await tx.query<QueueRow>(
      `SELECT * FROM cre_delivery_requests_v1
       WHERE deal_id = $1 AND terms_version = $2 AND evidence_revision = $3
         AND state IN ('pending', 'leased')
       ORDER BY created_at ASC, request_key ASC
       LIMIT 1 FOR UPDATE`,
      [request.dealId.toLowerCase(), request.termsVersion, request.evidenceRevision],
    );
    const activeRow = active.rows[0];
    if (activeRow) {
      const activeRecord = rowToRecord(activeRow);
      if (!samePublicRequest(activeRecord, request)) {
        return { ok: false, code: 'REQUEST_CONFLICT', message: 'a different active request already exists for this delivery revision' };
      }
      return { ok: true, value: activeRecord, idempotent: true };
    }
    const key = creDeliveryRequestKey(request);
    const inserted = await tx.query<QueueRow>(
      `INSERT INTO cre_delivery_requests_v1
        (request_key, deal_id, terms_version, evidence_revision, expires_at, pull_number,
         submitted_sha, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $8)
       ON CONFLICT (request_key) DO NOTHING
       RETURNING *`,
      [key, request.dealId.toLowerCase(), request.termsVersion, request.evidenceRevision, request.expiresAt, request.pullNumber, request.submittedSha.toLowerCase(), nowMs],
    );
    const insertedRow = inserted.rows[0];
    if (insertedRow) return { ok: true, value: rowToRecord(insertedRow), idempotent: false };
    const existing = await tx.query<QueueRow>('SELECT * FROM cre_delivery_requests_v1 WHERE request_key = $1 FOR UPDATE', [key]);
    const existingRow = existing.rows[0];
    if (!existingRow) return { ok: false, code: 'REQUEST_NOT_FOUND', message: 'request disappeared while publishing' };
    const existingRecord = rowToRecord(existingRow);
    if (!samePublicRequest(existingRecord, request)) {
      return { ok: false, code: 'REQUEST_CONFLICT', message: 'request identity is already bound to different data' };
    }
    return { ok: true, value: existingRecord, idempotent: true };
  });
}

export async function publishCreDeliveryRequest(
  request: CreDeliveryRequest,
  nowMs = Date.now(),
): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
  const runtime = await postgresRuntime();
  if (runtime.pgEnabled) {
    return new PostgresCreDeliveryRequestQueue({
      withTransaction: runtime.withPostgresTransaction,
    }).publish(request, nowMs);
  }
  return withFlatStore(() => publishFlat(request, nowMs));
}

/// Legacy adoption is intentionally the same idempotent publish boundary. It
/// never overwrites an active revision, and it cannot bypass queue leases,
/// receipt completion, or redelivery cancellation.
export async function adoptLegacyCreDeliveryRequest(
  request: CreDeliveryRequest,
  nowMs = Date.now(),
): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
  return publishCreDeliveryRequest(request, nowMs);
}

function claimFlat(requestKeys: readonly string[], nowMs: number, leaseMs: number): CreClaimResult | null {
  const records = readFlatRecords();
  expireFlatRecords(records, nowMs);
  const eligible = [...records.values()]
    .filter((record) => requestKeys.includes(record.requestKey))
    .filter((record) => record.state === 'pending' && record.expiresAt > nowSeconds(nowMs))
    .sort((left, right) => left.createdAt - right.createdAt || left.requestKey.localeCompare(right.requestKey));
  const next = eligible[0];
  if (!next) {
    writeFlatRecords(records);
    return null;
  }
  const claimed: CreDeliveryRequestRecord = {
    ...next,
    state: 'leased',
    leaseToken: randomUUID(),
    leaseExpiresAt: nowMs + leaseMs,
    updatedAt: nowMs,
  };
  records.set(next.requestKey, claimed);
  writeFlatRecords(records);
  return { record: claimed };
}

async function claimPostgres(
  sql: CreDeliveryRequestQueueSqlRuntime,
  requestKeys: readonly string[],
  nowMs: number,
  leaseMs: number,
): Promise<CreClaimResult | null> {
  if (requestKeys.length === 0) return null;
  return sql.withTransaction(async (tx) => {
    const seconds = nowSeconds(nowMs);
    await tx.query(
      `UPDATE cre_delivery_requests_v1
       SET state = 'expired', lease_token = NULL, lease_expires_at = NULL, updated_at = $1
       WHERE state IN ('pending', 'leased') AND expires_at <= $2`,
      [nowMs, seconds],
    );
    await tx.query(
      `UPDATE cre_delivery_requests_v1
       SET state = 'pending', lease_token = NULL, lease_expires_at = NULL, updated_at = $1
       WHERE state = 'leased' AND lease_expires_at <= $1 AND expires_at > $2`,
      [nowMs, seconds],
    );
    const selected = await tx.query<QueueRow>(
      `SELECT * FROM cre_delivery_requests_v1
       WHERE request_key = ANY($1::text[]) AND state = 'pending' AND expires_at > $2
       ORDER BY created_at ASC, request_key ASC
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [requestKeys, seconds],
    );
    const row = selected.rows[0];
    if (!row) return null;
    const token = randomUUID();
    const claimed = await tx.query<QueueRow>(
      `UPDATE cre_delivery_requests_v1
       SET state = 'leased', lease_token = $1, lease_expires_at = $2, updated_at = $3
       WHERE request_key = $4
       RETURNING *`,
      [token, nowMs + leaseMs, nowMs, row.request_key],
    );
    const claimedRow = claimed.rows[0];
    return claimedRow ? { record: rowToRecord(claimedRow) } : null;
  });
}

export async function claimCreDeliveryRequest(
  requestKeys: readonly string[],
  nowMs = Date.now(),
  leaseMs = 90_000,
): Promise<CreClaimResult | null> {
  const runtime = await postgresRuntime();
  if (runtime.pgEnabled) {
    return new PostgresCreDeliveryRequestQueue({
      withTransaction: runtime.withPostgresTransaction,
    }).claim(requestKeys, nowMs, leaseMs);
  }
  return withFlatStore(() => claimFlat(requestKeys, nowMs, leaseMs));
}

function sameReceipt(left: CreEvidenceReceiptBinding, right: CreEvidenceReceiptBinding): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function completeFlat(request: CreDeliveryRequest, receipt: CreEvidenceReceiptBinding, nowMs: number): CreQueueResult<CreDeliveryRequestRecord> {
  const key = creDeliveryRequestKey(request);
  const records = readFlatRecords();
  const leased = records.get(key);
  if (leased?.state === 'leased' && (leased.leaseExpiresAt ?? 0) <= nowMs) {
    records.set(key, {
      ...leased,
      state: leased.expiresAt <= nowSeconds(nowMs) ? 'expired' : 'pending',
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: nowMs,
    });
    writeFlatRecords(records);
    return { ok: false, code: 'REQUEST_EXPIRED', message: 'the delivery request lease has elapsed' };
  }
  expireFlatRecords(records, nowMs);
  const existing = records.get(key);
  if (!existing) return { ok: false, code: 'REQUEST_NOT_FOUND', message: 'the delivery request is not in the durable queue' };
  if (existing.state === 'cancelled') return { ok: false, code: 'REQUEST_CANCELLED', message: 'the delivery request was cancelled by a newer delivery' };
  if (existing.state === 'expired') return { ok: false, code: 'REQUEST_EXPIRED', message: 'the delivery request lease or expiry has elapsed' };
  if (existing.state === 'completed') {
    if (!existing.receipt || !sameReceipt(existing.receipt, receipt)) {
      return { ok: false, code: 'RECEIPT_CONFLICT', message: 'a different receipt is already bound to this request' };
    }
    return { ok: true, value: existing, idempotent: true };
  }
  const completed: CreDeliveryRequestRecord = {
    ...existing,
    state: 'completed',
    receipt,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
    completedAt: nowMs,
    updatedAt: nowMs,
  };
  records.set(key, completed);
  writeFlatRecords(records);
  return { ok: true, value: completed, idempotent: false };
}

async function completePostgres(
  sql: CreDeliveryRequestQueueSqlRuntime,
  request: CreDeliveryRequest,
  receipt: CreEvidenceReceiptBinding,
  nowMs: number,
): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
  return sql.withTransaction(async (tx) => {
    const result = await tx.query<QueueRow>('SELECT * FROM cre_delivery_requests_v1 WHERE request_key = $1 FOR UPDATE', [creDeliveryRequestKey(request)]);
    const row = result.rows[0];
    if (!row) return { ok: false, code: 'REQUEST_NOT_FOUND', message: 'the delivery request is not in the durable queue' };
    const existing = rowToRecord(row);
    if (existing.state === 'cancelled') return { ok: false, code: 'REQUEST_CANCELLED', message: 'the delivery request was cancelled by a newer delivery' };
    if (existing.state === 'expired' || (existing.state !== 'completed' && existing.expiresAt <= nowSeconds(nowMs))) {
      return { ok: false, code: 'REQUEST_EXPIRED', message: 'the delivery request lease or expiry has elapsed' };
    }
    if (existing.state === 'completed') {
      if (!existing.receipt || !sameReceipt(existing.receipt, receipt)) {
        return { ok: false, code: 'RECEIPT_CONFLICT', message: 'a different receipt is already bound to this request' };
      }
      return { ok: true, value: existing, idempotent: true };
    }
    if (existing.state !== 'leased') return { ok: false, code: 'REQUEST_NOT_CLAIMED', message: 'claim the delivery request before posting its receipt' };
    if ((existing.leaseExpiresAt ?? 0) <= nowMs) return { ok: false, code: 'REQUEST_EXPIRED', message: 'the delivery request lease has elapsed' };
    const completed = await tx.query<QueueRow>(
      `UPDATE cre_delivery_requests_v1
       SET state = 'completed', receipt = $1::jsonb, lease_token = NULL,
           lease_expires_at = NULL, completed_at = $2, updated_at = $2
       WHERE request_key = $3
       RETURNING *`,
      [JSON.stringify(receipt), nowMs, existing.requestKey],
    );
    const completedRow = completed.rows[0];
    if (!completedRow) return { ok: false, code: 'REQUEST_NOT_FOUND', message: 'the delivery request disappeared while completing' };
    return { ok: true, value: rowToRecord(completedRow), idempotent: false };
  });
}

export async function completeCreDeliveryRequest(
  request: CreDeliveryRequest,
  receipt: CreEvidenceReceiptBinding,
  nowMs = Date.now(),
): Promise<CreQueueResult<CreDeliveryRequestRecord>> {
  const runtime = await postgresRuntime();
  if (runtime.pgEnabled) {
    return new PostgresCreDeliveryRequestQueue({
      withTransaction: runtime.withPostgresTransaction,
    }).complete(request, receipt, nowMs);
  }
  return withFlatStore(() => completeFlat(request, receipt, nowMs));
}

async function cancelFlat(dealId: string, nowMs: number): Promise<number> {
  const records = readFlatRecords();
  let cancelled = 0;
  for (const [key, record] of records) {
    if (record.dealId.toLowerCase() !== dealId.toLowerCase()) continue;
    if (record.state !== 'pending' && record.state !== 'leased') continue;
    records.set(key, { ...record, state: 'cancelled', leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: nowMs });
    cancelled += 1;
  }
  if (cancelled > 0) writeFlatRecords(records);
  return cancelled;
}

async function cancelPostgres(sql: CreDeliveryRequestQueueSqlRuntime, dealId: string, nowMs: number): Promise<number> {
  return sql.withTransaction(async (tx) => {
    const result = await tx.query<{ count: string }>(
      `WITH cancelled AS (
         UPDATE cre_delivery_requests_v1
         SET state = 'cancelled', lease_token = NULL, lease_expires_at = NULL, updated_at = $2
         WHERE deal_id = $1 AND state IN ('pending', 'leased')
         RETURNING request_key
       ) SELECT count(*)::text AS count FROM cancelled`,
      [dealId.toLowerCase(), nowMs],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

export async function cancelCreDeliveryRequests(dealId: string, nowMs = Date.now()): Promise<number> {
  const runtime = await postgresRuntime();
  if (runtime.pgEnabled) {
    return new PostgresCreDeliveryRequestQueue({
      withTransaction: runtime.withPostgresTransaction,
    }).cancel(dealId, nowMs);
  }
  return withFlatStore(() => cancelFlat(dealId, nowMs));
}
