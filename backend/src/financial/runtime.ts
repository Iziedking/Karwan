import type { RuntimeData } from '../db/agentRuntime.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';
import type {
  FinancialDecision,
  FinancialOperation,
  ProviderLifecycle,
  ProviderSubmission,
} from './commandBoundary.js';

export interface FinancialCommandRecord {
  commandId: string;
  idempotencyKey: string;
  operation: FinancialOperation;
  amountUsdc: string;
  amountMicros: string;
  sourceAddress: string;
  destinationAddress: string;
  expectedDealRoomVersion: number;
  expectedOfferVersion?: number;
  mandateVersion: number;
  decision: FinancialDecision;
  reason: string;
  providerLifecycle: ProviderLifecycle;
  providerId?: string;
  txHash?: string;
  failureCode?: string;
  approvalId?: string;
  approvalVersion?: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  data: RuntimeData;
}

export type FinancialCommandInput = Omit<
  FinancialCommandRecord,
  'providerLifecycle' | 'version' | 'createdAt' | 'updatedAt'
> & { now?: number };

export class FinancialRuntimeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinancialRuntimeConflictError';
  }
}

export class FinancialRuntimeDuplicateError extends Error {
  constructor(boundary: string) {
    super(`duplicate financial runtime boundary: ${boundary}`);
    this.name = 'FinancialRuntimeDuplicateError';
  }
}

export interface FinancialRuntimeRepository {
  recordDecision(input: FinancialCommandInput): Promise<{ record: FinancialCommandRecord; created: boolean }>;
  get(idempotencyKey: string): Promise<FinancialCommandRecord | null>;
  recordProviderUpdate(
    idempotencyKey: string,
    expectedVersion: number,
    submission: ProviderSubmission,
    now?: number,
  ): Promise<FinancialCommandRecord>;
}

export interface FinancialRuntimeAuditSummary {
  total: number;
  authorized: number;
  approvalRequired: number;
  rejected: number;
  created: number;
  submitted: number;
  unknown: number;
  reconciling: number;
  settled: number;
  failed: number;
}

export interface FinancialRuntimeAuditStore {
  list(limit?: number): Promise<readonly FinancialCommandRecord[]>;
  summary(): Promise<FinancialRuntimeAuditSummary>;
}

const lifecycleTransitions: Record<ProviderLifecycle, readonly ProviderLifecycle[]> = {
  CREATED: ['SUBMITTED', 'UNKNOWN', 'FAILED'],
  SUBMITTED: ['UNKNOWN', 'RECONCILING', 'SETTLED', 'FAILED'],
  UNKNOWN: ['RECONCILING', 'SETTLED', 'FAILED'],
  RECONCILING: ['UNKNOWN', 'SETTLED', 'FAILED'],
  SETTLED: [],
  FAILED: [],
};

function assertLifecycle(current: ProviderLifecycle, next: ProviderLifecycle): void {
  if (current !== next && !lifecycleTransitions[current].includes(next)) {
    throw new FinancialRuntimeConflictError(`invalid provider lifecycle ${current}->${next}`);
  }
}

function assertSettled(submission: ProviderSubmission): void {
  if (submission.lifecycle === 'SETTLED' && !submission.txHash) {
    throw new FinancialRuntimeConflictError('SETTLED_REQUIRES_TX_HASH');
  }
}

function sameCommand(current: FinancialCommandRecord, input: FinancialCommandInput): boolean {
  return current.commandId === input.commandId
    && current.operation === input.operation
    && current.amountUsdc === input.amountUsdc
    && current.amountMicros === input.amountMicros
    && current.sourceAddress === input.sourceAddress
    && current.destinationAddress === input.destinationAddress
    && current.expectedDealRoomVersion === input.expectedDealRoomVersion
    && current.expectedOfferVersion === input.expectedOfferVersion
    && current.mandateVersion === input.mandateVersion
    && current.decision === input.decision
    && current.reason === input.reason
    && current.approvalId === input.approvalId
    && current.approvalVersion === input.approvalVersion;
}

function mergeSubmission(current: FinancialCommandRecord, submission: ProviderSubmission, now: number): FinancialCommandRecord {
  assertSettled(submission);
  assertLifecycle(current.providerLifecycle, submission.lifecycle);
  if (current.providerId && submission.providerId && current.providerId !== submission.providerId) {
    throw new FinancialRuntimeConflictError('PROVIDER_ID_CHANGED');
  }
  return {
    ...current,
    providerLifecycle: submission.lifecycle,
    ...(submission.providerId ? { providerId: submission.providerId } : {}),
    ...(submission.txHash ? { txHash: submission.txHash } : {}),
    ...(submission.failureCode ? { failureCode: submission.failureCode } : {}),
    version: current.version + 1,
    updatedAt: now,
  };
}

function isDuplicateSubmission(current: FinancialCommandRecord, submission: ProviderSubmission): boolean {
  return current.providerLifecycle === submission.lifecycle
    && (submission.providerId === undefined || current.providerId === submission.providerId)
    && (submission.txHash === undefined || current.txHash === submission.txHash)
    && (submission.failureCode === undefined || current.failureCode === submission.failureCode);
}

export class InMemoryFinancialRuntimeRepository implements FinancialRuntimeRepository, FinancialRuntimeAuditStore {
  private readonly records = new Map<string, FinancialCommandRecord>();

  async recordDecision(input: FinancialCommandInput): Promise<{ record: FinancialCommandRecord; created: boolean }> {
    const existing = this.records.get(input.idempotencyKey);
    if (existing) {
      if (!sameCommand(existing, input)) throw new FinancialRuntimeDuplicateError(`financial_command.key:${input.idempotencyKey}`);
      return { record: existing, created: false };
    }
    const now = input.now ?? Date.now();
    const record: FinancialCommandRecord = { ...input, providerLifecycle: 'CREATED', version: 1, createdAt: now, updatedAt: now };
    this.records.set(input.idempotencyKey, record);
    return { record, created: true };
  }

  async get(idempotencyKey: string): Promise<FinancialCommandRecord | null> {
    return this.records.get(idempotencyKey) ?? null;
  }

  async list(limit = 100): Promise<readonly FinancialCommandRecord[]> {
    return [...this.records.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, Math.min(500, limit)));
  }

  async summary(): Promise<FinancialRuntimeAuditSummary> {
    const records = await this.list(500);
    return summarizeFinancialRecords(records);
  }

  async recordProviderUpdate(idempotencyKey: string, expectedVersion: number, submission: ProviderSubmission, now = Date.now()): Promise<FinancialCommandRecord> {
    const current = this.records.get(idempotencyKey);
    if (!current || current.version !== expectedVersion) throw new FinancialRuntimeConflictError(`financial command ${idempotencyKey} version ${expectedVersion} is stale`);
    if (isDuplicateSubmission(current, submission)) return current;
    const next = mergeSubmission(current, submission, now);
    this.records.set(idempotencyKey, next);
    return next;
  }
}

interface FinancialRow extends Record<string, unknown> {
  command_id: string;
  idempotency_key: string;
  operation: FinancialOperation;
  amount_usdc: string;
  amount_micros: string;
  source_address: string;
  destination_address: string;
  expected_deal_room_version: number | string;
  expected_offer_version: number | string | null;
  mandate_version: number | string;
  decision: FinancialDecision;
  reason: string;
  provider_lifecycle: ProviderLifecycle;
  provider_id: string | null;
  tx_hash: string | null;
  failure_code: string | null;
  approval_id: string | null;
  approval_version: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
  data: RuntimeData;
}

function integer(value: number | string | null, label: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe financial runtime ${label}`);
  return parsed;
}

function requiredInteger(value: number | string, label: string): number {
  const parsed = integer(value, label);
  if (parsed === undefined) throw new Error(`missing financial runtime ${label}`);
  return parsed;
}

function fromRow(row: FinancialRow): FinancialCommandRecord {
  return {
    commandId: row.command_id,
    idempotencyKey: row.idempotency_key,
    operation: row.operation,
    amountUsdc: row.amount_usdc,
    amountMicros: row.amount_micros,
    sourceAddress: row.source_address,
    destinationAddress: row.destination_address,
    expectedDealRoomVersion: requiredInteger(row.expected_deal_room_version, 'deal room version'),
    ...(row.expected_offer_version === null ? {} : { expectedOfferVersion: requiredInteger(row.expected_offer_version, 'offer version') }),
    mandateVersion: requiredInteger(row.mandate_version, 'mandate version'),
    decision: row.decision,
    reason: row.reason,
    providerLifecycle: row.provider_lifecycle,
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    ...(row.tx_hash ? { txHash: row.tx_hash } : {}),
    ...(row.failure_code ? { failureCode: row.failure_code } : {}),
    ...(row.approval_id ? { approvalId: row.approval_id } : {}),
    ...(row.approval_version === null ? {} : { approvalVersion: requiredInteger(row.approval_version, 'approval version') }),
    version: requiredInteger(row.version, 'version'),
    createdAt: requiredInteger(row.created_at, 'created_at'),
    updatedAt: requiredInteger(row.updated_at, 'updated_at'),
    data: row.data,
  };
}

function commandParams(input: FinancialCommandInput, now: number): readonly unknown[] {
  return [
    input.commandId, input.idempotencyKey, input.operation, input.amountUsdc, input.amountMicros,
    input.sourceAddress, input.destinationAddress, input.expectedDealRoomVersion,
    input.expectedOfferVersion ?? null, input.mandateVersion, input.decision, input.reason,
    'CREATED', input.providerId ?? null, input.txHash ?? null, input.failureCode ?? null,
    input.approvalId ?? null, input.approvalVersion ?? null, now, now, JSON.stringify(input.data),
  ];
}

export class PostgresFinancialRuntimeRepository implements FinancialRuntimeRepository {
  constructor(private readonly executor: SqlExecutor, private readonly transaction: TransactionRunner) {}

  async recordDecision(input: FinancialCommandInput): Promise<{ record: FinancialCommandRecord; created: boolean }> {
    return this.transaction(async (tx) => {
      const now = input.now ?? Date.now();
      const inserted = await tx.query<FinancialRow>(
        `INSERT INTO financial_commands_v2
          (command_id,idempotency_key,operation,amount_usdc,amount_micros,source_address,destination_address,
           expected_deal_room_version,expected_offer_version,mandate_version,decision,reason,provider_lifecycle,
           provider_id,tx_hash,failure_code,approval_id,approval_version,created_at,updated_at,data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
        commandParams(input, now),
      );
      const row = inserted.rows[0] ?? (await tx.query<FinancialRow>('SELECT * FROM financial_commands_v2 WHERE idempotency_key = $1', [input.idempotencyKey])).rows[0];
      if (!row) throw new Error('financial command was not persisted');
      const record = fromRow(row);
      if (!sameCommand(record, input)) throw new FinancialRuntimeDuplicateError(`financial_command.key:${input.idempotencyKey}`);
      return { record, created: inserted.rows.length > 0 };
    });
  }

  async get(idempotencyKey: string): Promise<FinancialCommandRecord | null> {
    const result = await this.executor.query<FinancialRow>('SELECT * FROM financial_commands_v2 WHERE idempotency_key = $1', [idempotencyKey]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async list(limit = 100): Promise<readonly FinancialCommandRecord[]> {
    const maximum = Math.max(1, Math.min(500, limit));
    const result = await this.executor.query<FinancialRow>(
      'SELECT * FROM financial_commands_v2 ORDER BY updated_at DESC LIMIT $1',
      [maximum],
    );
    return result.rows.map(fromRow);
  }

  async summary(): Promise<FinancialRuntimeAuditSummary> {
    const result = await this.executor.query<{
      total: string;
      authorized: string;
      approval_required: string;
      rejected: string;
      created: string;
      submitted: string;
      unknown: string;
      reconciling: string;
      settled: string;
      failed: string;
    }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE decision = 'AUTHORIZED') AS authorized,
              COUNT(*) FILTER (WHERE decision = 'APPROVAL_REQUIRED') AS approval_required,
              COUNT(*) FILTER (WHERE decision = 'REJECTED') AS rejected,
              COUNT(*) FILTER (WHERE provider_lifecycle = 'CREATED') AS created,
              COUNT(*) FILTER (WHERE provider_lifecycle = 'SUBMITTED') AS submitted,
              COUNT(*) FILTER (WHERE provider_lifecycle = 'UNKNOWN') AS unknown,
              COUNT(*) FILTER (WHERE provider_lifecycle = 'RECONCILING') AS reconciling,
              COUNT(*) FILTER (WHERE provider_lifecycle = 'SETTLED') AS settled,
              COUNT(*) FILTER (WHERE provider_lifecycle = 'FAILED') AS failed
         FROM financial_commands_v2`,
    );
    const row = result.rows[0];
    if (!row) throw new Error('financial runtime summary returned no row');
    return {
      total: requiredInteger(row.total, 'summary total'),
      authorized: requiredInteger(row.authorized, 'summary authorized'),
      approvalRequired: requiredInteger(row.approval_required, 'summary approval required'),
      rejected: requiredInteger(row.rejected, 'summary rejected'),
      created: requiredInteger(row.created, 'summary created'),
      submitted: requiredInteger(row.submitted, 'summary submitted'),
      unknown: requiredInteger(row.unknown, 'summary unknown'),
      reconciling: requiredInteger(row.reconciling, 'summary reconciling'),
      settled: requiredInteger(row.settled, 'summary settled'),
      failed: requiredInteger(row.failed, 'summary failed'),
    };
  }

  async recordProviderUpdate(idempotencyKey: string, expectedVersion: number, submission: ProviderSubmission, now = Date.now()): Promise<FinancialCommandRecord> {
    return this.transaction(async (tx) => {
      const row = (await tx.query<FinancialRow>('SELECT * FROM financial_commands_v2 WHERE idempotency_key = $1 FOR UPDATE', [idempotencyKey])).rows[0];
      if (!row) throw new FinancialRuntimeConflictError(`unknown financial command ${idempotencyKey}`);
      const current = fromRow(row);
      if (current.version !== expectedVersion) throw new FinancialRuntimeConflictError(`financial command ${idempotencyKey} version ${expectedVersion} is stale`);
      if (isDuplicateSubmission(current, submission)) return current;
      const next = mergeSubmission(current, submission, now);
      const updated = (await tx.query<FinancialRow>(
        `UPDATE financial_commands_v2
            SET provider_lifecycle=$2, provider_id=COALESCE($3,provider_id), tx_hash=COALESCE($4,tx_hash),
                failure_code=COALESCE($5,failure_code), version=version+1, updated_at=$6
          WHERE idempotency_key=$1 AND version=$7 RETURNING *`,
        [idempotencyKey, next.providerLifecycle, next.providerId ?? null, next.txHash ?? null, next.failureCode ?? null, now, expectedVersion],
      )).rows[0];
      if (!updated) throw new FinancialRuntimeConflictError(`financial command ${idempotencyKey} update lost`);
      return fromRow(updated);
    });
  }
}

function summarizeFinancialRecords(records: readonly FinancialCommandRecord[]): FinancialRuntimeAuditSummary {
  const countDecision = (decision: FinancialDecision): number => records.filter((record) => record.decision === decision).length;
  const countLifecycle = (lifecycle: ProviderLifecycle): number => records.filter((record) => record.providerLifecycle === lifecycle).length;
  return {
    total: records.length,
    authorized: countDecision('AUTHORIZED'),
    approvalRequired: countDecision('APPROVAL_REQUIRED'),
    rejected: countDecision('REJECTED'),
    created: countLifecycle('CREATED'),
    submitted: countLifecycle('SUBMITTED'),
    unknown: countLifecycle('UNKNOWN'),
    reconciling: countLifecycle('RECONCILING'),
    settled: countLifecycle('SETTLED'),
    failed: countLifecycle('FAILED'),
  };
}
