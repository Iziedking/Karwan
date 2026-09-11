import { randomUUID } from 'node:crypto';
import { pgEnabled, postgresExecutor, withPostgresTransaction } from '../db/client.js';

export type DeadlineRecoveryState = 'waiting' | 'running' | 'succeeded' | 'failed';

export interface DeadlineRecoveryRecord {
  jobId: string;
  deadlineUnix: number;
  availableAt: number;
  state: DeadlineRecoveryState;
  attempt: number;
  leaseToken?: string;
  leaseExpiresAt?: number;
  movementReference?: string;
  txHash?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeadlineRecoveryLease {
  jobId: string;
  leaseToken: string;
}

interface RecoveryRow extends Record<string, unknown> {
  job_id: string;
  deadline_unix: number | string;
  available_at: number | string;
  state: DeadlineRecoveryState;
  attempt: number | string;
  lease_token: string | null;
  lease_expires_at: number | string | null;
  movement_reference: string | null;
  tx_hash: string | null;
  last_error: string | null;
  created_at: number | string;
  updated_at: number | string;
}

const memory = new Map<string, DeadlineRecoveryRecord>();

function integer(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${label}`);
  return parsed;
}

function fromRow(row: RecoveryRow): DeadlineRecoveryRecord {
  return {
    jobId: row.job_id,
    deadlineUnix: integer(row.deadline_unix, 'deadline_unix'),
    availableAt: integer(row.available_at, 'available_at'),
    state: row.state,
    attempt: integer(row.attempt, 'attempt'),
    ...(row.lease_token ? { leaseToken: row.lease_token } : {}),
    ...(row.lease_expires_at == null ? {} : { leaseExpiresAt: integer(row.lease_expires_at, 'lease_expires_at') }),
    ...(row.movement_reference ? { movementReference: row.movement_reference } : {}),
    ...(row.tx_hash ? { txHash: row.tx_hash } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    createdAt: integer(row.created_at, 'created_at'),
    updatedAt: integer(row.updated_at, 'updated_at'),
  };
}

function normalizeJobId(jobId: string): string {
  const normalized = jobId.trim().toLowerCase();
  if (!normalized) throw new Error('deadline recovery job id is required');
  return normalized;
}

function memoryCopy(record: DeadlineRecoveryRecord): DeadlineRecoveryRecord {
  return { ...record };
}

export function deadlineRecoveryReadyAt(deadlineUnix: number, graceMs: number): number {
  if (!Number.isSafeInteger(deadlineUnix) || deadlineUnix <= 0) {
    throw new Error('deadlineUnix must be a positive integer');
  }
  if (!Number.isSafeInteger(graceMs) || graceMs < 0) {
    throw new Error('graceMs must be a non-negative integer');
  }
  return deadlineUnix * 1_000 + graceMs;
}

export async function ensureDeadlineRecovery(input: {
  jobId: string;
  deadlineUnix: number;
  availableAt: number;
  now?: number;
}): Promise<DeadlineRecoveryRecord> {
  const jobId = normalizeJobId(input.jobId);
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(input.availableAt) || input.availableAt < 0) {
    throw new Error('recovery availableAt must be a non-negative integer');
  }
  if (pgEnabled) {
    const result = await postgresExecutor().query<RecoveryRow>(
      `INSERT INTO deal_deadline_recoveries_v1 (
         job_id, deadline_unix, available_at, state, attempt, created_at, updated_at
       ) VALUES ($1, $2, $3, 'waiting', 0, $4, $4)
       ON CONFLICT (job_id) DO UPDATE SET
         deadline_unix = EXCLUDED.deadline_unix,
         available_at = CASE
           WHEN deal_deadline_recoveries_v1.deadline_unix <> EXCLUDED.deadline_unix
           THEN EXCLUDED.available_at
           ELSE deal_deadline_recoveries_v1.available_at
         END,
         state = CASE
           WHEN deal_deadline_recoveries_v1.deadline_unix <> EXCLUDED.deadline_unix
           THEN 'waiting'
           ELSE deal_deadline_recoveries_v1.state
         END,
         attempt = CASE
           WHEN deal_deadline_recoveries_v1.deadline_unix <> EXCLUDED.deadline_unix
           THEN 0
           ELSE deal_deadline_recoveries_v1.attempt
         END,
         lease_token = CASE
           WHEN deal_deadline_recoveries_v1.deadline_unix <> EXCLUDED.deadline_unix
           THEN NULL
           ELSE deal_deadline_recoveries_v1.lease_token
         END,
         lease_expires_at = CASE
           WHEN deal_deadline_recoveries_v1.deadline_unix <> EXCLUDED.deadline_unix
           THEN NULL
           ELSE deal_deadline_recoveries_v1.lease_expires_at
         END,
         last_error = CASE
           WHEN deal_deadline_recoveries_v1.deadline_unix <> EXCLUDED.deadline_unix
           THEN NULL
           ELSE deal_deadline_recoveries_v1.last_error
         END,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [jobId, input.deadlineUnix, input.availableAt, now],
    );
    return fromRow(result.rows[0]!);
  }

  const existing = memory.get(jobId);
  if (existing && existing.deadlineUnix === input.deadlineUnix) return memoryCopy(existing);
  const record: DeadlineRecoveryRecord = {
    jobId,
    deadlineUnix: input.deadlineUnix,
    availableAt: input.availableAt,
    state: 'waiting',
    attempt: 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  memory.set(jobId, record);
  return memoryCopy(record);
}

export async function getDeadlineRecovery(jobIdInput: string): Promise<DeadlineRecoveryRecord | null> {
  const jobId = normalizeJobId(jobIdInput);
  if (pgEnabled) {
    const result = await postgresExecutor().query<RecoveryRow>(
      'SELECT * FROM deal_deadline_recoveries_v1 WHERE job_id = $1',
      [jobId],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }
  const record = memory.get(jobId);
  return record ? memoryCopy(record) : null;
}

export async function claimDeadlineRecovery(input: {
  jobId: string;
  now?: number;
  leaseMs?: number;
}): Promise<DeadlineRecoveryLease | null> {
  const jobId = normalizeJobId(input.jobId);
  const now = input.now ?? Date.now();
  const leaseMs = Math.max(5_000, Math.floor(input.leaseMs ?? 60_000));
  const leaseToken = randomUUID();
  if (pgEnabled) {
    return withPostgresTransaction(async (tx) => {
      const result = await tx.query<{ job_id: string; lease_token: string }>(
        `UPDATE deal_deadline_recoveries_v1
         SET state = 'running', attempt = attempt + 1, lease_token = $2,
             lease_expires_at = $3, updated_at = $4
         WHERE job_id = $1
           AND state IN ('waiting', 'failed', 'running')
           AND available_at <= $4
           AND (lease_expires_at IS NULL OR lease_expires_at <= $4)
         RETURNING job_id, lease_token`,
        [jobId, leaseToken, now + leaseMs, now],
      );
      return result.rows[0] ? { jobId: result.rows[0].job_id, leaseToken: result.rows[0].lease_token } : null;
    });
  }

  const record = memory.get(jobId);
  if (!record || record.availableAt > now || record.state === 'succeeded') return null;
  if (record.state === 'running' && (record.leaseExpiresAt ?? Number.MAX_SAFE_INTEGER) > now) return null;
  record.state = 'running';
  record.attempt += 1;
  record.leaseToken = leaseToken;
  record.leaseExpiresAt = now + leaseMs;
  record.updatedAt = now;
  return { jobId, leaseToken };
}

export async function recordDeadlineRecoveryMovement(
  lease: DeadlineRecoveryLease,
  movementReference: string,
  now = Date.now(),
): Promise<void> {
  if (!movementReference.trim()) throw new Error('recovery movement reference is required');
  if (pgEnabled) {
    const result = await postgresExecutor().query<{ job_id: string }>(
      `UPDATE deal_deadline_recoveries_v1
       SET movement_reference = $3, updated_at = $4
       WHERE job_id = $1 AND lease_token = $2 AND state = 'running'`,
      [lease.jobId, lease.leaseToken, movementReference, now],
    );
    if (!result.rows[0]) throw new Error('deadline recovery lease lost');
    return;
  }
  const record = memory.get(lease.jobId);
  if (!record || record.leaseToken !== lease.leaseToken || record.state !== 'running') {
    throw new Error('deadline recovery lease lost');
  }
  record.movementReference = movementReference;
  record.updatedAt = now;
}

export async function completeDeadlineRecovery(
  lease: DeadlineRecoveryLease,
  input: { movementReference?: string; txHash?: string; now?: number },
): Promise<void> {
  const now = input.now ?? Date.now();
  if (pgEnabled) {
    const result = await postgresExecutor().query<{ job_id: string }>(
      `UPDATE deal_deadline_recoveries_v1
       SET state = 'succeeded', lease_token = NULL, lease_expires_at = NULL,
           movement_reference = COALESCE($3, movement_reference),
           tx_hash = COALESCE($4, tx_hash), last_error = NULL, updated_at = $5
       WHERE job_id = $1 AND lease_token = $2 AND state = 'running'
       RETURNING job_id`,
      [lease.jobId, lease.leaseToken, input.movementReference ?? null, input.txHash ?? null, now],
    );
    if (!result.rows[0]) throw new Error('deadline recovery lease lost');
    return;
  }
  const record = memory.get(lease.jobId);
  if (!record || record.leaseToken !== lease.leaseToken || record.state !== 'running') {
    throw new Error('deadline recovery lease lost');
  }
  record.state = 'succeeded';
  record.leaseToken = undefined;
  record.leaseExpiresAt = undefined;
  record.lastError = undefined;
  if (input.movementReference) record.movementReference = input.movementReference;
  if (input.txHash) record.txHash = input.txHash;
  record.updatedAt = now;
}

export async function failDeadlineRecovery(
  lease: DeadlineRecoveryLease,
  input: { error: string; nextAvailableAt: number; now?: number },
): Promise<void> {
  const now = input.now ?? Date.now();
  const error = input.error.trim().slice(0, 1_000) || 'recovery attempt failed';
  if (pgEnabled) {
    const result = await postgresExecutor().query<{ job_id: string }>(
      `UPDATE deal_deadline_recoveries_v1
       SET state = 'failed', lease_token = NULL, lease_expires_at = NULL,
           available_at = $3, last_error = $4, updated_at = $5
       WHERE job_id = $1 AND lease_token = $2 AND state = 'running'
       RETURNING job_id`,
      [lease.jobId, lease.leaseToken, input.nextAvailableAt, error, now],
    );
    if (!result.rows[0]) throw new Error('deadline recovery lease lost');
    return;
  }
  const record = memory.get(lease.jobId);
  if (!record || record.leaseToken !== lease.leaseToken || record.state !== 'running') {
    throw new Error('deadline recovery lease lost');
  }
  record.state = 'failed';
  record.availableAt = input.nextAvailableAt;
  record.leaseToken = undefined;
  record.leaseExpiresAt = undefined;
  record.lastError = error;
  record.updatedAt = now;
}

export function deadlineRecoveryBackoffMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(8, Math.floor(attempt) - 1));
  return Math.min(30 * 60_000, 30_000 * 2 ** exponent);
}
