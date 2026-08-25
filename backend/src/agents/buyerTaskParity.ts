import { isDeepStrictEqual } from 'node:util';
import type { SqlExecutor } from '../db/migrations.js';
import {
  type BuyerRuntimeSnapshot,
  type CollectionShadowDecision,
  type CollectionShadowTaskData,
  type CounterTimeoutShadowDecision,
  type CounterTimeoutShadowTaskData,
  planCollectionShadow,
  planCounterTimeoutShadow,
} from './buyerTaskPlanning.js';

export type BuyerTimerParityKind = 'collection' | 'counter-timeout';
export type BuyerTimerParityDecision =
  | CollectionShadowDecision
  | CounterTimeoutShadowDecision;

export type BuyerTimerParitySchedule =
  | { kind: 'collection'; data: CollectionShadowTaskData }
  | { kind: 'counter-timeout'; data: CounterTimeoutShadowTaskData };

export interface BuyerTimerParityKey {
  jobId: string;
  kind: BuyerTimerParityKind;
  scheduleVersion: number;
}

export interface BuyerTimerParityScheduleInput extends BuyerTimerParityKey {
  scheduledFor: number;
  snapshotRevision: number;
  createdAt: number;
}

export interface BuyerTimerParityComparisonInput extends BuyerTimerParityKey {
  snapshotRevision: number;
  observedAt: number;
  legacyDecision: BuyerTimerParityDecision;
  plannerDecision: BuyerTimerParityDecision;
}

export interface BuyerTimerParityTaskInput extends BuyerTimerParityKey {
  observedAt: number;
  taskDecision: BuyerTimerParityDecision;
}

export type BuyerTimerParityComparisonStatus = 'pending' | 'matched' | 'diverged';
export type BuyerTimerParityTaskStatus =
  | 'pending'
  | 'awaiting-planner'
  | 'matched'
  | 'stale-suppressed'
  | 'diverged';

export interface BuyerTimerParityAudit extends BuyerTimerParityKey {
  scheduledFor: number;
  scheduledSnapshotRevision: number;
  createdAt: number;
  comparisonSnapshotRevision?: number;
  legacyObservedAt?: number;
  legacyDecision?: BuyerTimerParityDecision;
  plannerDecision?: BuyerTimerParityDecision;
  taskObservedAt?: number;
  taskDecision?: BuyerTimerParityDecision;
  comparisonStatus: BuyerTimerParityComparisonStatus;
  taskStatus: BuyerTimerParityTaskStatus;
}

export interface BuyerTimerParitySummary {
  total: number;
  byKind: Record<BuyerTimerParityKind, number>;
  comparison: Record<BuyerTimerParityComparisonStatus, number>;
  task: Record<BuyerTimerParityTaskStatus, number>;
}

export interface BuyerTimerParityAuditStore {
  ensureSchedule(input: BuyerTimerParityScheduleInput): Promise<BuyerTimerParityAudit>;
  recordComparison(input: BuyerTimerParityComparisonInput): Promise<BuyerTimerParityAudit>;
  recordTaskDecision(input: BuyerTimerParityTaskInput): Promise<BuyerTimerParityAudit>;
  list(input?: {
    jobId?: string;
    kind?: BuyerTimerParityKind;
    limit?: number;
  }): Promise<BuyerTimerParityAudit[]>;
  summary(): Promise<BuyerTimerParitySummary>;
}

interface ParityRow extends Record<string, unknown> {
  job_id: string;
  timer_kind: BuyerTimerParityKind;
  schedule_version: string | number;
  scheduled_for: string | number;
  scheduled_snapshot_revision: string | number;
  created_at: string | number;
  comparison_snapshot_revision: string | number | null;
  legacy_observed_at: string | number | null;
  legacy_decision: BuyerTimerParityDecision | null;
  planner_decision: BuyerTimerParityDecision | null;
  task_observed_at: string | number | null;
  task_decision: BuyerTimerParityDecision | null;
}

interface ParitySummaryRow extends Record<string, unknown> {
  total: string | number;
  collection_count: string | number;
  counter_count: string | number;
  comparison_pending: string | number;
  comparison_matched: string | number;
  comparison_diverged: string | number;
  task_pending: string | number;
  task_awaiting_planner: string | number;
  task_matched: string | number;
  task_stale_suppressed: string | number;
  task_diverged: string | number;
}

export class PostgresBuyerTimerParityAuditStore implements BuyerTimerParityAuditStore {
  constructor(private readonly executor: SqlExecutor) {}

  async ensureSchedule(input: BuyerTimerParityScheduleInput): Promise<BuyerTimerParityAudit> {
    const normalized = normalizeScheduleInput(input);
    const inserted = await this.executor.query<ParityRow>(
      `INSERT INTO buyer_timer_parity_audits_v2 (
         job_id, timer_kind, schedule_version, scheduled_for,
         scheduled_snapshot_revision, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (job_id, timer_kind, schedule_version) DO UPDATE
       SET scheduled_for = EXCLUDED.scheduled_for,
           scheduled_snapshot_revision = EXCLUDED.scheduled_snapshot_revision,
           created_at = LEAST(buyer_timer_parity_audits_v2.created_at, EXCLUDED.created_at)
       WHERE buyer_timer_parity_audits_v2.scheduled_for = 0
       RETURNING *`,
      [
        normalized.jobId,
        normalized.kind,
        normalized.scheduleVersion,
        normalized.scheduledFor,
        normalized.snapshotRevision,
        normalized.createdAt,
      ],
    );
    const row = inserted.rows[0] ?? await this.requiredRow(normalized);
    if (
      Number(row.scheduled_for) !== normalized.scheduledFor ||
      Number(row.scheduled_snapshot_revision) !== normalized.snapshotRevision
    ) {
      throw new Error(`buyer timer parity schedule conflict: ${parityKey(normalized)}`);
    }
    return parityFromRow(row);
  }

  async recordComparison(input: BuyerTimerParityComparisonInput): Promise<BuyerTimerParityAudit> {
    const normalized = normalizeComparisonInput(input);
    const result = await this.executor.query<ParityRow>(
      `INSERT INTO buyer_timer_parity_audits_v2 (
         job_id, timer_kind, schedule_version, scheduled_for,
         scheduled_snapshot_revision, created_at, comparison_snapshot_revision,
         legacy_observed_at, legacy_decision, planner_decision
       ) VALUES ($1, $2, $3, 0, $4, $5, $4, $5, $6, $7)
       ON CONFLICT (job_id, timer_kind, schedule_version) DO UPDATE
       SET comparison_snapshot_revision = COALESCE(
             buyer_timer_parity_audits_v2.comparison_snapshot_revision,
             EXCLUDED.comparison_snapshot_revision
           ),
           legacy_observed_at = COALESCE(
             buyer_timer_parity_audits_v2.legacy_observed_at,
             EXCLUDED.legacy_observed_at
           ),
           legacy_decision = COALESCE(
             buyer_timer_parity_audits_v2.legacy_decision,
             EXCLUDED.legacy_decision
           ),
           planner_decision = COALESCE(
             buyer_timer_parity_audits_v2.planner_decision,
             EXCLUDED.planner_decision
           )
       WHERE (
           buyer_timer_parity_audits_v2.legacy_decision IS NULL OR
           buyer_timer_parity_audits_v2.legacy_decision = EXCLUDED.legacy_decision
         ) AND (
           buyer_timer_parity_audits_v2.planner_decision IS NULL OR
           buyer_timer_parity_audits_v2.planner_decision = EXCLUDED.planner_decision
         )
       RETURNING *`,
      [
        normalized.jobId,
        normalized.kind,
        normalized.scheduleVersion,
        normalized.snapshotRevision,
        normalized.observedAt,
        normalized.legacyDecision,
        normalized.plannerDecision,
      ],
    );
    if (!result.rows[0]) {
      throw new Error(`buyer timer parity comparison conflict: ${parityKey(normalized)}`);
    }
    return parityFromRow(result.rows[0]);
  }

  async recordTaskDecision(input: BuyerTimerParityTaskInput): Promise<BuyerTimerParityAudit> {
    const normalized = normalizeTaskInput(input);
    const result = await this.executor.query<ParityRow>(
      `INSERT INTO buyer_timer_parity_audits_v2 (
         job_id, timer_kind, schedule_version, scheduled_for,
         scheduled_snapshot_revision, created_at, task_observed_at, task_decision
       ) VALUES ($1, $2, $3, 0, 1, $4, $4, $5)
       ON CONFLICT (job_id, timer_kind, schedule_version) DO UPDATE
       SET task_observed_at = COALESCE(
             buyer_timer_parity_audits_v2.task_observed_at,
             EXCLUDED.task_observed_at
           ),
           task_decision = COALESCE(
             buyer_timer_parity_audits_v2.task_decision,
             EXCLUDED.task_decision
           )
       WHERE buyer_timer_parity_audits_v2.task_decision IS NULL OR
             buyer_timer_parity_audits_v2.task_decision = EXCLUDED.task_decision
       RETURNING *`,
      [
        normalized.jobId,
        normalized.kind,
        normalized.scheduleVersion,
        normalized.observedAt,
        normalized.taskDecision,
      ],
    );
    if (!result.rows[0]) {
      throw new Error(`buyer timer parity task conflict: ${parityKey(normalized)}`);
    }
    return parityFromRow(result.rows[0]);
  }

  async list(input: {
    jobId?: string;
    kind?: BuyerTimerParityKind;
    limit?: number;
  } = {}): Promise<BuyerTimerParityAudit[]> {
    const limit = boundedLimit(input.limit);
    const result = await this.executor.query<ParityRow>(
      `SELECT * FROM buyer_timer_parity_audits_v2
       WHERE ($1::text IS NULL OR job_id = $1)
         AND ($2::text IS NULL OR timer_kind = $2)
       ORDER BY created_at DESC, job_id ASC, schedule_version DESC
       LIMIT $3`,
      [input.jobId?.toLowerCase() ?? null, input.kind ?? null, limit],
    );
    return result.rows.map(parityFromRow);
  }

  async summary(): Promise<BuyerTimerParitySummary> {
    const result = await this.executor.query<ParitySummaryRow>(
      `SELECT
         count(*) AS total,
         count(*) FILTER (WHERE timer_kind = 'collection') AS collection_count,
         count(*) FILTER (WHERE timer_kind = 'counter-timeout') AS counter_count,
         count(*) FILTER (
           WHERE legacy_decision IS NULL OR planner_decision IS NULL
         ) AS comparison_pending,
         count(*) FILTER (
           WHERE legacy_decision IS NOT NULL AND legacy_decision = planner_decision
         ) AS comparison_matched,
         count(*) FILTER (
           WHERE legacy_decision IS NOT NULL AND legacy_decision <> planner_decision
         ) AS comparison_diverged,
         count(*) FILTER (WHERE task_decision IS NULL) AS task_pending,
         count(*) FILTER (
           WHERE task_decision IS NOT NULL
             AND task_decision->>'action' <> 'stale'
             AND planner_decision IS NULL
         ) AS task_awaiting_planner,
         count(*) FILTER (
           WHERE task_decision IS NOT NULL
             AND task_decision->>'action' <> 'stale'
             AND planner_decision IS NOT NULL
             AND task_decision = planner_decision
         ) AS task_matched,
         count(*) FILTER (
           WHERE task_decision->>'action' = 'stale'
         ) AS task_stale_suppressed,
         count(*) FILTER (
           WHERE task_decision IS NOT NULL
             AND task_decision->>'action' <> 'stale'
             AND planner_decision IS NOT NULL
             AND task_decision <> planner_decision
         ) AS task_diverged
       FROM buyer_timer_parity_audits_v2`,
    );
    const row = result.rows[0];
    if (!row) return summarizeBuyerTimerParity([]);
    return {
      total: Number(row.total),
      byKind: {
        collection: Number(row.collection_count),
        'counter-timeout': Number(row.counter_count),
      },
      comparison: {
        pending: Number(row.comparison_pending),
        matched: Number(row.comparison_matched),
        diverged: Number(row.comparison_diverged),
      },
      task: {
        pending: Number(row.task_pending),
        'awaiting-planner': Number(row.task_awaiting_planner),
        matched: Number(row.task_matched),
        'stale-suppressed': Number(row.task_stale_suppressed),
        diverged: Number(row.task_diverged),
      },
    };
  }

  private async requiredRow(key: BuyerTimerParityKey): Promise<ParityRow> {
    const result = await this.executor.query<ParityRow>(
      `SELECT * FROM buyer_timer_parity_audits_v2
       WHERE job_id = $1 AND timer_kind = $2 AND schedule_version = $3`,
      [key.jobId.toLowerCase(), key.kind, key.scheduleVersion],
    );
    if (!result.rows[0]) throw new Error(`buyer timer parity audit missing: ${parityKey(key)}`);
    return result.rows[0];
  }
}

export class InMemoryBuyerTimerParityAuditStore implements BuyerTimerParityAuditStore {
  private readonly records = new Map<string, BuyerTimerParityAudit>();

  async ensureSchedule(input: BuyerTimerParityScheduleInput): Promise<BuyerTimerParityAudit> {
    const normalized = normalizeScheduleInput(input);
    const key = parityKey(normalized);
    const prior = this.records.get(key);
    if (prior) {
      if (prior.scheduledFor === 0) {
        const completed = classifyAudit({
          ...prior,
          scheduledFor: normalized.scheduledFor,
          scheduledSnapshotRevision: normalized.snapshotRevision,
          createdAt: Math.min(prior.createdAt, normalized.createdAt),
        });
        this.records.set(key, completed);
        return structuredClone(completed);
      }
      if (
        prior.scheduledFor !== normalized.scheduledFor ||
        prior.scheduledSnapshotRevision !== normalized.snapshotRevision
      ) {
        throw new Error(`buyer timer parity schedule conflict: ${key}`);
      }
      return structuredClone(prior);
    }
    const audit = classifyAudit({
      jobId: normalized.jobId,
      kind: normalized.kind,
      scheduleVersion: normalized.scheduleVersion,
      scheduledFor: normalized.scheduledFor,
      scheduledSnapshotRevision: normalized.snapshotRevision,
      createdAt: normalized.createdAt,
    });
    this.records.set(key, audit);
    return structuredClone(audit);
  }

  async recordComparison(input: BuyerTimerParityComparisonInput): Promise<BuyerTimerParityAudit> {
    const normalized = normalizeComparisonInput(input);
    const key = parityKey(normalized);
    const prior = this.records.get(key) ?? classifyAudit({
      jobId: normalized.jobId,
      kind: normalized.kind,
      scheduleVersion: normalized.scheduleVersion,
      scheduledFor: 0,
      scheduledSnapshotRevision: normalized.snapshotRevision,
      createdAt: normalized.observedAt,
    });
    if (
      (prior.legacyDecision && !isDeepStrictEqual(prior.legacyDecision, normalized.legacyDecision)) ||
      (prior.plannerDecision && !isDeepStrictEqual(prior.plannerDecision, normalized.plannerDecision))
    ) {
      throw new Error(`buyer timer parity comparison conflict: ${key}`);
    }
    const audit = classifyAudit({
      ...prior,
      comparisonSnapshotRevision:
        prior.comparisonSnapshotRevision ?? normalized.snapshotRevision,
      legacyObservedAt: prior.legacyObservedAt ?? normalized.observedAt,
      legacyDecision: prior.legacyDecision ?? structuredClone(normalized.legacyDecision),
      plannerDecision: prior.plannerDecision ?? structuredClone(normalized.plannerDecision),
    });
    this.records.set(key, audit);
    return structuredClone(audit);
  }

  async recordTaskDecision(input: BuyerTimerParityTaskInput): Promise<BuyerTimerParityAudit> {
    const normalized = normalizeTaskInput(input);
    const key = parityKey(normalized);
    const prior = this.records.get(key) ?? classifyAudit({
      jobId: normalized.jobId,
      kind: normalized.kind,
      scheduleVersion: normalized.scheduleVersion,
      scheduledFor: 0,
      scheduledSnapshotRevision: 1,
      createdAt: normalized.observedAt,
    });
    if (prior.taskDecision && !isDeepStrictEqual(prior.taskDecision, normalized.taskDecision)) {
      throw new Error(`buyer timer parity task conflict: ${key}`);
    }
    const audit = classifyAudit({
      ...prior,
      taskObservedAt: prior.taskObservedAt ?? normalized.observedAt,
      taskDecision: prior.taskDecision ?? structuredClone(normalized.taskDecision),
    });
    this.records.set(key, audit);
    return structuredClone(audit);
  }

  async list(input: {
    jobId?: string;
    kind?: BuyerTimerParityKind;
    limit?: number;
  } = {}): Promise<BuyerTimerParityAudit[]> {
    const jobId = input.jobId?.toLowerCase();
    return [...this.records.values()]
      .filter((record) => !jobId || record.jobId === jobId)
      .filter((record) => !input.kind || record.kind === input.kind)
      .sort((left, right) =>
        right.createdAt - left.createdAt ||
        left.jobId.localeCompare(right.jobId) ||
        right.scheduleVersion - left.scheduleVersion)
      .slice(0, boundedLimit(input.limit))
      .map((record) => structuredClone(record));
  }

  async summary(): Promise<BuyerTimerParitySummary> {
    return summarizeBuyerTimerParity([...this.records.values()]);
  }
}

export interface BuyerTimerParityObservation {
  snapshot: BuyerRuntimeSnapshot;
  schedule: BuyerTimerParitySchedule;
  legacyDecision: BuyerTimerParityDecision;
  observedAt: number;
}

export type BuyerTimerParityObserver = (
  observation: BuyerTimerParityObservation,
) => Promise<void>;

export function createBuyerTimerParityObserver(
  store: BuyerTimerParityAuditStore,
): BuyerTimerParityObserver {
  return async ({ snapshot, schedule, legacyDecision, observedAt }) => {
    const key = parityKeyFromSchedule(schedule);
    const plannerDecision = schedule.kind === 'collection'
      ? planCollectionShadow(snapshot, schedule.data, observedAt)
      : planCounterTimeoutShadow(snapshot, schedule.data, observedAt);
    await store.recordComparison({
      ...key,
      snapshotRevision: snapshot.revision,
      observedAt,
      legacyDecision,
      plannerDecision,
    });
  };
}

export function parityKeyFromSchedule(
  schedule: BuyerTimerParitySchedule,
): BuyerTimerParityKey & { scheduledFor: number } {
  return schedule.kind === 'collection'
    ? {
        jobId: schedule.data.jobId.toLowerCase(),
        kind: 'collection',
        scheduleVersion: schedule.data.scheduleVersion,
        scheduledFor: schedule.data.closeAt,
      }
    : {
        jobId: schedule.data.jobId.toLowerCase(),
        kind: 'counter-timeout',
        scheduleVersion: schedule.data.scheduleVersion,
        scheduledFor: schedule.data.dueAt,
      };
}

export function classifyBuyerTimerParity(
  legacyDecision?: BuyerTimerParityDecision,
  plannerDecision?: BuyerTimerParityDecision,
): BuyerTimerParityComparisonStatus {
  if (!legacyDecision || !plannerDecision) return 'pending';
  return isDeepStrictEqual(legacyDecision, plannerDecision) ? 'matched' : 'diverged';
}

export function classifyBuyerTimerTask(
  plannerDecision?: BuyerTimerParityDecision,
  taskDecision?: BuyerTimerParityDecision,
): BuyerTimerParityTaskStatus {
  if (!taskDecision) return 'pending';
  if (taskDecision.action === 'stale') return 'stale-suppressed';
  if (!plannerDecision) return 'awaiting-planner';
  return isDeepStrictEqual(plannerDecision, taskDecision) ? 'matched' : 'diverged';
}

export function summarizeBuyerTimerParity(
  records: readonly BuyerTimerParityAudit[],
): BuyerTimerParitySummary {
  const summary: BuyerTimerParitySummary = {
    total: 0,
    byKind: { collection: 0, 'counter-timeout': 0 },
    comparison: { pending: 0, matched: 0, diverged: 0 },
    task: {
      pending: 0,
      'awaiting-planner': 0,
      matched: 0,
      'stale-suppressed': 0,
      diverged: 0,
    },
  };
  for (const record of records) {
    summary.total += 1;
    summary.byKind[record.kind] += 1;
    summary.comparison[record.comparisonStatus] += 1;
    summary.task[record.taskStatus] += 1;
  }
  return summary;
}

function normalizeScheduleInput(input: BuyerTimerParityScheduleInput): BuyerTimerParityScheduleInput {
  validateKey(input);
  assertNonnegativeInteger(input.scheduledFor, 'scheduledFor');
  assertPositiveInteger(input.snapshotRevision, 'snapshotRevision');
  assertNonnegativeInteger(input.createdAt, 'createdAt');
  return { ...input, jobId: input.jobId.toLowerCase() };
}

function normalizeComparisonInput(
  input: BuyerTimerParityComparisonInput,
): BuyerTimerParityComparisonInput {
  validateKey(input);
  assertPositiveInteger(input.snapshotRevision, 'snapshotRevision');
  assertNonnegativeInteger(input.observedAt, 'observedAt');
  return {
    ...input,
    jobId: input.jobId.toLowerCase(),
    legacyDecision: structuredClone(input.legacyDecision),
    plannerDecision: structuredClone(input.plannerDecision),
  };
}

function normalizeTaskInput(input: BuyerTimerParityTaskInput): BuyerTimerParityTaskInput {
  validateKey(input);
  assertNonnegativeInteger(input.observedAt, 'observedAt');
  return {
    ...input,
    jobId: input.jobId.toLowerCase(),
    taskDecision: structuredClone(input.taskDecision),
  };
}

function validateKey(input: BuyerTimerParityKey): void {
  if (!input.jobId.trim()) throw new Error('jobId is required');
  if (input.kind !== 'collection' && input.kind !== 'counter-timeout') {
    throw new Error('unsupported buyer timer parity kind');
  }
  assertPositiveInteger(input.scheduleVersion, 'scheduleVersion');
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be positive`);
}

function assertNonnegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be nonnegative`);
}

function boundedLimit(value?: number): number {
  if (value === undefined) return 100;
  if (!Number.isSafeInteger(value)) return 100;
  return Math.max(1, Math.min(value, 500));
}

function parityKey(input: BuyerTimerParityKey): string {
  return `${input.jobId.toLowerCase()}:${input.kind}:${input.scheduleVersion}`;
}

function classifyAudit(
  record: Omit<BuyerTimerParityAudit, 'comparisonStatus' | 'taskStatus'>,
): BuyerTimerParityAudit {
  return {
    ...record,
    comparisonStatus: classifyBuyerTimerParity(
      record.legacyDecision,
      record.plannerDecision,
    ),
    taskStatus: classifyBuyerTimerTask(record.plannerDecision, record.taskDecision),
  };
}

function parityFromRow(row: ParityRow): BuyerTimerParityAudit {
  return classifyAudit({
    jobId: row.job_id,
    kind: row.timer_kind,
    scheduleVersion: Number(row.schedule_version),
    scheduledFor: Number(row.scheduled_for),
    scheduledSnapshotRevision: Number(row.scheduled_snapshot_revision),
    createdAt: Number(row.created_at),
    ...(row.comparison_snapshot_revision !== null
      ? { comparisonSnapshotRevision: Number(row.comparison_snapshot_revision) }
      : {}),
    ...(row.legacy_observed_at !== null
      ? { legacyObservedAt: Number(row.legacy_observed_at) }
      : {}),
    ...(row.legacy_decision ? { legacyDecision: structuredClone(row.legacy_decision) } : {}),
    ...(row.planner_decision ? { plannerDecision: structuredClone(row.planner_decision) } : {}),
    ...(row.task_observed_at !== null
      ? { taskObservedAt: Number(row.task_observed_at) }
      : {}),
    ...(row.task_decision ? { taskDecision: structuredClone(row.task_decision) } : {}),
  });
}
