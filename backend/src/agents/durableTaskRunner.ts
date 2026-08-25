import { isDeepStrictEqual } from 'node:util';
import type { AgentTaskState } from '../domain/agentRuntimeState.js';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';

export type TaskCheckpointPhase =
  | 'candidate.generated'
  | 'candidate.evaluated'
  | 'bid.submitted'
  | 'negotiation.turn'
  | 'proposal.created'
  | 'authorization.recorded'
  | 'external.submitted'
  | 'external.reconciled'
  | 'task.completed';

export interface DurableTask {
  id: string;
  dealRoomId?: string;
  kind: string;
  state: AgentTaskState;
  idempotencyKey: string;
  version: number;
  attempt: number;
  maxAttempts: number;
  availableAt: number;
  leaseOwner?: string;
  leaseToken?: string;
  leaseExpiresAt?: number;
  heartbeatAt?: number;
  lastError?: string;
  completedAt?: number;
  deadLetteredAt?: number;
  createdAt: number;
  updatedAt: number;
  data: RuntimeData;
}

export interface DurableTaskAuditSummary {
  total: number;
  byState: Readonly<Record<AgentTaskState, number>>;
  retrying: number;
  deadLettered: number;
  leaseLosses: number;
  repeatedReengagements: number;
}

export interface DurableTaskAuditStore {
  summary(): Promise<DurableTaskAuditSummary>;
  listRecent(input?: { limit?: number; state?: AgentTaskState }): Promise<readonly DurableTask[]>;
}

export interface TaskCheckpoint {
  id: string;
  taskId: string;
  checkpointKey: string;
  sequence: number;
  phase: TaskCheckpointPhase;
  externalId?: string;
  createdAt: number;
  data: RuntimeData;
}

export interface IngestionCursor {
  source: string;
  partitionKey: string;
  cursor: string;
  version: number;
  updatedAt: number;
  data: RuntimeData;
}

export interface EnqueueTaskInput {
  id: string;
  dealRoomId?: string;
  kind: string;
  idempotencyKey: string;
  availableAt: number;
  maxAttempts?: number;
  data: RuntimeData;
  now?: number;
}

export interface TriggeredTaskInput {
  triggerId: string;
  triggerKey: string;
  triggerKind: string;
  sourceEventId?: string;
  triggerData: RuntimeData;
  task: EnqueueTaskInput;
  now?: number;
}

export interface TaskLease {
  taskId: string;
  workerId: string;
  leaseToken: string;
}

export interface DurableTaskStore {
  enqueue(input: EnqueueTaskInput): Promise<{ task: DurableTask; created: boolean }>;
  enqueueFromTrigger(input: TriggeredTaskInput): Promise<{ task: DurableTask; created: boolean }>;
  claimDue(input: {
    workerId: string;
    now: number;
    leaseMs: number;
    limit: number;
  }): Promise<DurableTask[]>;
  start(lease: TaskLease, now: number): Promise<DurableTask>;
  heartbeat(lease: TaskLease, now: number, leaseMs: number): Promise<void>;
  listCheckpoints(taskId: string): Promise<TaskCheckpoint[]>;
  checkpoint(
    lease: TaskLease,
    input: {
      checkpointKey: string;
      phase: TaskCheckpointPhase;
      externalId?: string;
      data: RuntimeData;
      now: number;
    },
  ): Promise<{ checkpoint: TaskCheckpoint; created: boolean }>;
  complete(lease: TaskLease, now: number): Promise<DurableTask>;
  reschedule(lease: TaskLease, availableAt: number, now: number): Promise<DurableTask>;
  fail(
    lease: TaskLease,
    input: { now: number; nextAvailableAt: number; error: string },
  ): Promise<DurableTask>;
  recordIngestedEvent(input: {
    source: string;
    eventKey: string;
    partitionKey: string;
    cursor: string;
    expectedCursorVersion: number;
    data: RuntimeData;
    now?: number;
  }): Promise<{ duplicate: boolean; cursor: IngestionCursor | null }>;
  get(taskId: string): Promise<DurableTask | null>;
  listDeadLetters(limit?: number): Promise<DurableTask[]>;
  replayDeadLetter(input: {
    taskId: string;
    replayKey: string;
    actor: string;
    now: number;
  }): Promise<{ task: DurableTask; replayed: boolean }>;
}

export class TaskLeaseLostError extends Error {
  constructor(taskId: string) {
    super(`durable task lease lost: ${taskId}`);
    this.name = 'TaskLeaseLostError';
  }
}

export class TaskCheckpointConflictError extends Error {
  constructor(taskId: string, checkpointKey: string) {
    super(`durable task checkpoint conflict: ${taskId}:${checkpointKey}`);
    this.name = 'TaskCheckpointConflictError';
  }
}

export class IngestionCursorConflictError extends Error {
  constructor(source: string, partitionKey: string, expectedVersion: number) {
    super(`ingestion cursor conflict: ${source}:${partitionKey}:${expectedVersion}`);
    this.name = 'IngestionCursorConflictError';
  }
}

export class DeadLetterReplayConflictError extends Error {
  constructor(replayKey: string) {
    super(`dead-letter replay key already belongs to another task: ${replayKey}`);
    this.name = 'DeadLetterReplayConflictError';
  }
}

export class DeadLetterReplayStateError extends Error {
  constructor(taskId: string, state: AgentTaskState | 'missing') {
    super(`dead-letter replay requires a dead-letter task: ${taskId}:${state}`);
    this.name = 'DeadLetterReplayStateError';
  }
}

const MANUAL_SHADOW_REPLAYABLE_TASK_KINDS = new Set([
  'buyer.collection_finalize.shadow',
  'buyer.counter_timeout.shadow',
  'deal_room.reengage',
  'evidence.acquisition.shadow',
  'evidence.qualification.shadow',
  'financial.command.shadow',
  'financial.reconcile.shadow',
  'negotiation.turn.shadow',
  'stake.qualification.shadow',
]);

export function isManualShadowReplayableTaskKind(kind: string): boolean {
  return MANUAL_SHADOW_REPLAYABLE_TASK_KINDS.has(kind);
}

interface TaskRow extends Record<string, unknown> {
  id: string;
  deal_room_id: string | null;
  kind: string;
  state: AgentTaskState;
  idempotency_key: string;
  version: number | string;
  attempt: number | string;
  max_attempts: number | string;
  available_at: number | string;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: number | string | null;
  heartbeat_at: number | string | null;
  last_error: string | null;
  completed_at: number | string | null;
  dead_lettered_at: number | string | null;
  lease_loss_count: number | string;
  created_at: number | string;
  updated_at: number | string;
  data: RuntimeData;
}

interface CheckpointRow extends Record<string, unknown> {
  id: string;
  task_id: string;
  checkpoint_key: string;
  sequence: number | string;
  phase: TaskCheckpointPhase;
  external_id: string | null;
  created_at: number | string;
  data: RuntimeData;
}

interface CursorRow extends Record<string, unknown> {
  source: string;
  partition_key: string;
  cursor: string;
  version: number | string;
  updated_at: number | string;
  data: RuntimeData;
}

function integer(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${label}: ${String(value)}`);
  return parsed;
}

function optionalInteger(value: number | string | null): number | undefined {
  return value == null ? undefined : integer(value, 'task timestamp');
}

function taskFrom(row: TaskRow): DurableTask {
  const dealRoomId = row.deal_room_id ?? undefined;
  const leaseOwner = row.lease_owner ?? undefined;
  const leaseToken = row.lease_token ?? undefined;
  const leaseExpiresAt = optionalInteger(row.lease_expires_at);
  const heartbeatAt = optionalInteger(row.heartbeat_at);
  const completedAt = optionalInteger(row.completed_at);
  const deadLetteredAt = optionalInteger(row.dead_lettered_at);
  return {
    id: row.id,
    ...(dealRoomId ? { dealRoomId } : {}),
    kind: row.kind,
    state: row.state,
    idempotencyKey: row.idempotency_key,
    version: integer(row.version, 'task version'),
    attempt: integer(row.attempt, 'task attempt'),
    maxAttempts: integer(row.max_attempts, 'task max attempts'),
    availableAt: integer(row.available_at, 'task available_at'),
    ...(leaseOwner ? { leaseOwner } : {}),
    ...(leaseToken ? { leaseToken } : {}),
    ...(leaseExpiresAt === undefined ? {} : { leaseExpiresAt }),
    ...(heartbeatAt === undefined ? {} : { heartbeatAt }),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(deadLetteredAt === undefined ? {} : { deadLetteredAt }),
    createdAt: integer(row.created_at, 'task created_at'),
    updatedAt: integer(row.updated_at, 'task updated_at'),
    data: row.data,
  };
}

function checkpointFrom(row: CheckpointRow): TaskCheckpoint {
  return {
    id: row.id,
    taskId: row.task_id,
    checkpointKey: row.checkpoint_key,
    sequence: integer(row.sequence, 'checkpoint sequence'),
    phase: row.phase,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    createdAt: integer(row.created_at, 'checkpoint created_at'),
    data: row.data,
  };
}

function cursorFrom(row: CursorRow): IngestionCursor {
  return {
    source: row.source,
    partitionKey: row.partition_key,
    cursor: row.cursor,
    version: integer(row.version, 'cursor version'),
    updatedAt: integer(row.updated_at, 'cursor updated_at'),
    data: row.data,
  };
}

function validateTaskIdentity(existing: DurableTask, input: EnqueueTaskInput): void {
  if (
    existing.id !== input.id ||
    existing.kind !== input.kind ||
    existing.dealRoomId !== input.dealRoomId
  ) {
    throw new Error(`task idempotency key belongs to another task: ${input.idempotencyKey}`);
  }
}

function validateLease(
  task: DurableTask | undefined,
  lease: TaskLease,
  now?: number,
): DurableTask {
  if (
    !task ||
    task.leaseOwner !== lease.workerId ||
    task.leaseToken !== lease.leaseToken ||
    (task.state !== 'leased' && task.state !== 'running') ||
    (now !== undefined && (task.leaseExpiresAt === undefined || task.leaseExpiresAt <= now))
  ) {
    throw new TaskLeaseLostError(lease.taskId);
  }
  return task;
}

function checkpointMatches(
  checkpoint: TaskCheckpoint,
  input: { phase: TaskCheckpointPhase; externalId?: string; data: RuntimeData },
): boolean {
  return (
    checkpoint.phase === input.phase &&
    checkpoint.externalId === input.externalId &&
    isDeepStrictEqual(checkpoint.data, input.data)
  );
}

const TASK_AUDIT_STATES: readonly AgentTaskState[] = [
  'pending', 'leased', 'running', 'waiting', 'failed', 'succeeded', 'dead_letter', 'cancelled',
];

function emptyTaskAuditCounts(): Record<AgentTaskState, number> {
  return Object.fromEntries(TASK_AUDIT_STATES.map((state) => [state, 0])) as Record<AgentTaskState, number>;
}

export class PostgresDurableTaskStore implements DurableTaskStore, DurableTaskAuditStore {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly transaction: TransactionRunner,
  ) {}

  async enqueue(input: EnqueueTaskInput): Promise<{ task: DurableTask; created: boolean }> {
    return this.transaction((tx) => this.enqueueInTransaction(tx, input));
  }

  async enqueueFromTrigger(
    input: TriggeredTaskInput,
  ): Promise<{ task: DurableTask; created: boolean }> {
    return this.transaction(async (tx) => {
      const priorTrigger = await tx.query<{ task_id: string; kind: string }>(
        'SELECT task_id, kind FROM agent_task_triggers WHERE trigger_key = $1',
        [input.triggerKey],
      );
      if (priorTrigger.rows[0]) {
        if (isMaterialReengagementTrigger(priorTrigger.rows[0].kind)) {
          await tx.query(
            'UPDATE agent_task_triggers SET duplicate_count = duplicate_count + 1 WHERE trigger_key = $1',
            [input.triggerKey],
          );
        }
        const prior = await tx.query<TaskRow>('SELECT * FROM agent_tasks WHERE id = $1', [priorTrigger.rows[0].task_id]);
        if (!prior.rows[0]) throw new Error(`trigger task not found: ${input.triggerKey}`);
        const task = taskFrom(prior.rows[0]);
        validateTaskIdentity(task, input.task);
        return { task, created: false };
      }

      const enqueued = await this.enqueueInTransaction(tx, {
        ...input.task,
        now: input.now ?? input.task.now,
      });
      const now = input.now ?? input.task.now ?? Date.now();
      const inserted = await tx.query<{ task_id: string }>(
        `INSERT INTO agent_task_triggers (
           id, trigger_key, task_id, deal_room_id, kind, source_event_id, created_at, data
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (trigger_key) DO NOTHING RETURNING task_id`,
        [
          input.triggerId,
          input.triggerKey,
          enqueued.task.id,
          enqueued.task.dealRoomId ?? null,
          input.triggerKind,
          input.sourceEventId ?? null,
          now,
          input.triggerData,
        ],
      );
      if (inserted.rows[0]) return { task: enqueued.task, created: enqueued.created };

      const raced = await tx.query<{ task_id: string; kind: string }>(
        'SELECT task_id, kind FROM agent_task_triggers WHERE trigger_key = $1',
        [input.triggerKey],
      );
      const taskId = raced.rows[0]?.task_id;
      if (!taskId) throw new Error(`trigger insert lost without a winner: ${input.triggerKey}`);
      if (isMaterialReengagementTrigger(raced.rows[0]?.kind)) {
        await tx.query(
          'UPDATE agent_task_triggers SET duplicate_count = duplicate_count + 1 WHERE trigger_key = $1',
          [input.triggerKey],
        );
      }
      const prior = await tx.query<TaskRow>('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
      if (!prior.rows[0]) throw new Error(`trigger task not found: ${input.triggerKey}`);
      const task = taskFrom(prior.rows[0]);
      validateTaskIdentity(task, input.task);
      return { task, created: false };
    });
  }

  async claimDue(input: {
    workerId: string;
    now: number;
    leaseMs: number;
    limit: number;
  }): Promise<DurableTask[]> {
    return this.transaction(async (tx) => {
      await tx.query(
        `UPDATE agent_tasks
         SET state = 'dead_letter', version = version + 1,
             dead_lettered_at = $1, updated_at = $1,
             last_error = COALESCE(last_error, 'lease expired after maximum attempts'),
             lease_loss_count = lease_loss_count + 1,
             lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
         WHERE state IN ('leased', 'running')
           AND lease_expires_at IS NOT NULL AND lease_expires_at <= $1
           AND attempt >= max_attempts`,
        [input.now],
      );
      const leaseMs = Math.max(1_000, Math.floor(input.leaseMs));
      const limit = Math.max(1, Math.min(100, Math.floor(input.limit)));
      const claimed = await tx.query<TaskRow>(
        `WITH due AS (
           SELECT id FROM agent_tasks
           WHERE attempt < max_attempts AND (
             (state IN ('pending', 'waiting', 'failed') AND available_at <= $1)
             OR (state IN ('leased', 'running') AND lease_expires_at IS NOT NULL AND lease_expires_at <= $1)
           )
           ORDER BY available_at ASC, created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE agent_tasks AS task
         SET state = 'leased', attempt = task.attempt + 1,
             version = task.version + 1, lease_owner = $3,
             lease_token = $3 || ':' || task.id || ':' || (task.attempt + 1)::text || ':' || $1::text,
             lease_expires_at = $4, heartbeat_at = $1, updated_at = $1,
             lease_loss_count = task.lease_loss_count + CASE
               WHEN task.state IN ('leased', 'running')
                 AND task.lease_expires_at IS NOT NULL
                 AND task.lease_expires_at <= $1
               THEN 1 ELSE 0 END,
             completed_at = NULL, dead_lettered_at = NULL
         FROM due WHERE task.id = due.id
         RETURNING task.*`,
        [input.now, limit, input.workerId, input.now + leaseMs],
      );
      return claimed.rows.map(taskFrom);
    });
  }

  async start(lease: TaskLease, now: number): Promise<DurableTask> {
    return this.updateLeaseState(lease, 'leased', 'running', now);
  }

  async heartbeat(lease: TaskLease, now: number, leaseMs: number): Promise<void> {
    const result = await this.executor.query(
      `UPDATE agent_tasks SET heartbeat_at = $4, lease_expires_at = $5, updated_at = $4
       WHERE id = $1 AND lease_owner = $2 AND lease_token = $3
         AND state IN ('leased', 'running') AND lease_expires_at > $4 RETURNING id`,
      [lease.taskId, lease.workerId, lease.leaseToken, now, now + Math.max(1_000, leaseMs)],
    );
    if (result.rows.length !== 1) throw new TaskLeaseLostError(lease.taskId);
  }

  async listCheckpoints(taskId: string): Promise<TaskCheckpoint[]> {
    const result = await this.executor.query<CheckpointRow>(
      'SELECT * FROM agent_task_checkpoints WHERE task_id = $1 ORDER BY sequence ASC',
      [taskId],
    );
    return result.rows.map(checkpointFrom);
  }

  async checkpoint(
    lease: TaskLease,
    input: {
      checkpointKey: string;
      phase: TaskCheckpointPhase;
      externalId?: string;
      data: RuntimeData;
      now: number;
    },
  ): Promise<{ checkpoint: TaskCheckpoint; created: boolean }> {
    return this.transaction(async (tx) => {
      const taskResult = await tx.query<TaskRow>('SELECT * FROM agent_tasks WHERE id = $1 FOR UPDATE', [lease.taskId]);
      validateLease(taskResult.rows[0] ? taskFrom(taskResult.rows[0]) : undefined, lease, input.now);
      const prior = await tx.query<CheckpointRow>(
        'SELECT * FROM agent_task_checkpoints WHERE task_id = $1 AND checkpoint_key = $2',
        [lease.taskId, input.checkpointKey],
      );
      if (prior.rows[0]) {
        const checkpoint = checkpointFrom(prior.rows[0]);
        if (!checkpointMatches(checkpoint, input)) {
          throw new TaskCheckpointConflictError(lease.taskId, input.checkpointKey);
        }
        return { checkpoint, created: false };
      }
      const sequenceResult = await tx.query<{ next_sequence: number | string }>(
        'SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM agent_task_checkpoints WHERE task_id = $1',
        [lease.taskId],
      );
      const sequence = integer(sequenceResult.rows[0]?.next_sequence ?? 1, 'checkpoint next sequence');
      const inserted = await tx.query<CheckpointRow>(
        `INSERT INTO agent_task_checkpoints (
           id, task_id, checkpoint_key, sequence, phase, external_id, created_at, data
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          `${lease.taskId}:checkpoint:${input.checkpointKey}`,
          lease.taskId,
          input.checkpointKey,
          sequence,
          input.phase,
          input.externalId ?? null,
          input.now,
          input.data,
        ],
      );
      return { checkpoint: checkpointFrom(inserted.rows[0]!), created: true };
    });
  }

  async complete(lease: TaskLease, now: number): Promise<DurableTask> {
    return this.finishLease(lease, {
      state: 'succeeded',
      now,
      availableAt: now,
      completedAt: now,
      deadLetteredAt: null,
      error: null,
    });
  }

  async reschedule(lease: TaskLease, availableAt: number, now: number): Promise<DurableTask> {
    return this.finishLease(lease, {
      state: 'waiting',
      now,
      availableAt,
      completedAt: null,
      deadLetteredAt: null,
      error: null,
    });
  }

  async fail(
    lease: TaskLease,
    input: { now: number; nextAvailableAt: number; error: string },
  ): Promise<DurableTask> {
    return this.transaction(async (tx) => {
      const locked = await tx.query<TaskRow>('SELECT * FROM agent_tasks WHERE id = $1 FOR UPDATE', [lease.taskId]);
      const task = validateLease(
        locked.rows[0] ? taskFrom(locked.rows[0]) : undefined,
        lease,
        input.now,
      );
      const deadLetter = task.attempt >= task.maxAttempts;
      const result = await tx.query<TaskRow>(
        `UPDATE agent_tasks
         SET state = $4, version = version + 1, available_at = $5,
             lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
             heartbeat_at = NULL, updated_at = $6, last_error = $7,
             dead_lettered_at = $8
         WHERE id = $1 AND lease_owner = $2 AND lease_token = $3
           AND lease_expires_at > $6 RETURNING *`,
        [
          lease.taskId,
          lease.workerId,
          lease.leaseToken,
          deadLetter ? 'dead_letter' : 'failed',
          input.nextAvailableAt,
          input.now,
          input.error.slice(0, 1_000),
          deadLetter ? input.now : null,
        ],
      );
      if (!result.rows[0]) throw new TaskLeaseLostError(lease.taskId);
      return taskFrom(result.rows[0]);
    });
  }

  async recordIngestedEvent(input: {
    source: string;
    eventKey: string;
    partitionKey: string;
    cursor: string;
    expectedCursorVersion: number;
    data: RuntimeData;
    now?: number;
  }): Promise<{ duplicate: boolean; cursor: IngestionCursor | null }> {
    return this.transaction(async (tx) => {
      const now = input.now ?? Date.now();
      const inserted = await tx.query(
        `INSERT INTO event_ingestion_dedupe_v2 (source, event_key, received_at, data)
         VALUES ($1, $2, $3, $4) ON CONFLICT (source, event_key) DO NOTHING
         RETURNING event_key`,
        [input.source, input.eventKey, now, input.data],
      );
      if (inserted.rows.length === 0) {
        const prior = await tx.query<CursorRow>(
          'SELECT * FROM event_ingestion_cursors_v2 WHERE source = $1 AND partition_key = $2',
          [input.source, input.partitionKey],
        );
        return { duplicate: true, cursor: prior.rows[0] ? cursorFrom(prior.rows[0]) : null };
      }

      const result = input.expectedCursorVersion === 0
        ? await tx.query<CursorRow>(
            `INSERT INTO event_ingestion_cursors_v2 (
               source, partition_key, cursor, version, updated_at, data
             ) VALUES ($1, $2, $3, 1, $4, $5)
             ON CONFLICT (source, partition_key) DO NOTHING RETURNING *`,
            [input.source, input.partitionKey, input.cursor, now, input.data],
          )
        : await tx.query<CursorRow>(
            `UPDATE event_ingestion_cursors_v2
             SET cursor = $3, version = version + 1, updated_at = $4, data = $5
             WHERE source = $1 AND partition_key = $2 AND version = $6 RETURNING *`,
            [
              input.source,
              input.partitionKey,
              input.cursor,
              now,
              input.data,
              input.expectedCursorVersion,
            ],
          );
      if (!result.rows[0]) {
        throw new IngestionCursorConflictError(
          input.source,
          input.partitionKey,
          input.expectedCursorVersion,
        );
      }
      return { duplicate: false, cursor: cursorFrom(result.rows[0]) };
    });
  }

  async listDeadLetters(limit = 100): Promise<DurableTask[]> {
    const result = await this.executor.query<TaskRow>(
      `SELECT * FROM agent_tasks WHERE state = 'dead_letter'
       ORDER BY dead_lettered_at DESC, updated_at DESC LIMIT $1`,
      [Math.max(1, Math.min(500, Math.floor(limit)))],
    );
    return result.rows.map(taskFrom);
  }

  async get(taskId: string): Promise<DurableTask | null> {
    const result = await this.executor.query<TaskRow>('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
    return result.rows[0] ? taskFrom(result.rows[0]) : null;
  }

  async replayDeadLetter(input: {
    taskId: string;
    replayKey: string;
    actor: string;
    now: number;
  }): Promise<{ task: DurableTask; replayed: boolean }> {
    return this.transaction(async (tx) => {
      const priorReplay = await tx.query<{ task_id: string }>(
        'SELECT task_id FROM agent_task_replays_v2 WHERE replay_key = $1',
        [input.replayKey],
      );
      if (priorReplay.rows[0]) {
        if (priorReplay.rows[0].task_id !== input.taskId) {
          throw new DeadLetterReplayConflictError(input.replayKey);
        }
        const priorTask = await tx.query<TaskRow>('SELECT * FROM agent_tasks WHERE id = $1', [input.taskId]);
        if (!priorTask.rows[0]) throw new DeadLetterReplayStateError(input.taskId, 'missing');
        return { task: taskFrom(priorTask.rows[0]), replayed: false };
      }

      const locked = await tx.query<TaskRow>(
        'SELECT * FROM agent_tasks WHERE id = $1 FOR UPDATE',
        [input.taskId],
      );
      const task = locked.rows[0] ? taskFrom(locked.rows[0]) : undefined;
      if (!task) throw new DeadLetterReplayStateError(input.taskId, 'missing');
      if (task.state !== 'dead_letter') {
        throw new DeadLetterReplayStateError(input.taskId, task.state);
      }

      const inserted = await tx.query<{ replay_key: string }>(
        `INSERT INTO agent_task_replays_v2 (replay_key, task_id, actor, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (replay_key) DO NOTHING
         RETURNING replay_key`,
        [input.replayKey, input.taskId, input.actor, input.now],
      );
      if (!inserted.rows[0]) {
        const raced = await tx.query<{ task_id: string }>(
          'SELECT task_id FROM agent_task_replays_v2 WHERE replay_key = $1',
          [input.replayKey],
        );
        if (raced.rows[0]?.task_id !== input.taskId) {
          throw new DeadLetterReplayConflictError(input.replayKey);
        }
        return { task, replayed: false };
      }

      const result = await tx.query<TaskRow>(
        `UPDATE agent_tasks
         SET state = 'pending', attempt = 0, version = version + 1,
             available_at = $2, lease_owner = NULL, lease_token = NULL,
             lease_expires_at = NULL, heartbeat_at = NULL,
             last_error = NULL, completed_at = NULL,
             dead_lettered_at = NULL, updated_at = $2
         WHERE id = $1 AND state = 'dead_letter'
         RETURNING *`,
        [input.taskId, input.now],
      );
      if (!result.rows[0]) throw new DeadLetterReplayStateError(input.taskId, 'missing');
      return { task: taskFrom(result.rows[0]), replayed: true };
    });
  }

  async summary(): Promise<DurableTaskAuditSummary> {
    const result = await this.executor.query<{ state: AgentTaskState; count: number | string; lease_losses: number | string }>(
      'SELECT state, COUNT(*)::int AS count, COALESCE(SUM(lease_loss_count), 0)::bigint AS lease_losses FROM agent_tasks GROUP BY state',
    );
    const triggerAudit = await this.executor.query<{ repeated_reengagements: number | string }>(
      `SELECT COALESCE(SUM(duplicate_count), 0)::bigint AS repeated_reengagements
       FROM agent_task_triggers
       WHERE kind = ANY($1::text[])`,
      [MATERIAL_REENGAGEMENT_TRIGGERS],
    );
    const byState = emptyTaskAuditCounts();
    let leaseLosses = 0;
    for (const row of result.rows) {
      if (row.state in byState) byState[row.state] = Number(row.count);
      leaseLosses += Number(row.lease_losses);
    }
    if (!Number.isSafeInteger(leaseLosses) || leaseLosses < 0) throw new Error('unsafe durable task lease-loss count');
    const repeatedReengagements = Number(triggerAudit.rows[0]?.repeated_reengagements ?? 0);
    if (!Number.isSafeInteger(repeatedReengagements) || repeatedReengagements < 0) throw new Error('unsafe durable task re-engagement count');
    return {
      total: Object.values(byState).reduce((total, count) => total + count, 0),
      byState,
      retrying: byState.failed,
      deadLettered: byState.dead_letter,
      leaseLosses,
      repeatedReengagements,
    };
  }

  async listRecent(input: { limit?: number; state?: AgentTaskState } = {}): Promise<readonly DurableTask[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    const result = input.state
      ? await this.executor.query<TaskRow>(
          `SELECT * FROM agent_tasks WHERE state = $2
           ORDER BY updated_at DESC, id DESC LIMIT $1`,
          [limit, input.state],
        )
      : await this.executor.query<TaskRow>(
          `SELECT * FROM agent_tasks ORDER BY updated_at DESC, id DESC LIMIT $1`,
          [limit],
        );
    return result.rows.map(taskFrom);
  }

  private async enqueueInTransaction(
    tx: SqlExecutor,
    input: EnqueueTaskInput,
  ): Promise<{ task: DurableTask; created: boolean }> {
    const now = input.now ?? Date.now();
    const result = await tx.query<TaskRow>(
      `INSERT INTO agent_tasks (
         id, deal_room_id, kind, state, idempotency_key, version, attempt,
         max_attempts, available_at, created_at, updated_at, data
       ) VALUES ($1, $2, $3, 'pending', $4, 1, 0, $5, $6, $7, $7, $8)
       ON CONFLICT DO NOTHING RETURNING *`,
      [
        input.id,
        input.dealRoomId ?? null,
        input.kind,
        input.idempotencyKey,
        Math.max(1, Math.floor(input.maxAttempts ?? 8)),
        input.availableAt,
        now,
        input.data,
      ],
    );
    if (result.rows[0]) return { task: taskFrom(result.rows[0]), created: true };
    const prior = await tx.query<TaskRow>('SELECT * FROM agent_tasks WHERE idempotency_key = $1', [input.idempotencyKey]);
    if (!prior.rows[0]) throw new Error(`task identity conflict: ${input.id}`);
    const task = taskFrom(prior.rows[0]);
    validateTaskIdentity(task, input);
    return { task, created: false };
  }

  private async updateLeaseState(
    lease: TaskLease,
    from: AgentTaskState,
    to: AgentTaskState,
    now: number,
  ): Promise<DurableTask> {
    const result = await this.executor.query<TaskRow>(
      `UPDATE agent_tasks SET state = $5, version = version + 1, updated_at = $4
       WHERE id = $1 AND lease_owner = $2 AND lease_token = $3 AND state = $6
         AND lease_expires_at > $4
       RETURNING *`,
      [lease.taskId, lease.workerId, lease.leaseToken, now, to, from],
    );
    if (!result.rows[0]) throw new TaskLeaseLostError(lease.taskId);
    return taskFrom(result.rows[0]);
  }

  private async finishLease(
    lease: TaskLease,
    input: {
      state: AgentTaskState;
      now: number;
      availableAt: number;
      completedAt: number | null;
      deadLetteredAt: number | null;
      error: string | null;
    },
  ): Promise<DurableTask> {
    const result = await this.executor.query<TaskRow>(
      `UPDATE agent_tasks
       SET state = $4, version = version + 1, available_at = $5,
           lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
           heartbeat_at = NULL, updated_at = $6, completed_at = $7,
           dead_lettered_at = $8, last_error = $9
       WHERE id = $1 AND lease_owner = $2 AND lease_token = $3
         AND state IN ('leased', 'running') AND lease_expires_at > $6 RETURNING *`,
      [
        lease.taskId,
        lease.workerId,
        lease.leaseToken,
        input.state,
        input.availableAt,
        input.now,
        input.completedAt,
        input.deadLetteredAt,
        input.error,
      ],
    );
    if (!result.rows[0]) throw new TaskLeaseLostError(lease.taskId);
    return taskFrom(result.rows[0]);
  }
}

interface InMemoryTaskRow {
  task: DurableTask;
  checkpoints: TaskCheckpoint[];
  leaseLosses: number;
}

export class InMemoryDurableTaskStore implements DurableTaskStore, DurableTaskAuditStore {
  private readonly tasks = new Map<string, InMemoryTaskRow>();
  private readonly taskByIdempotency = new Map<string, string>();
  private readonly triggerToTask = new Map<string, string>();
  private readonly triggerKinds = new Map<string, string>();
  private repeatedReengagements = 0;
  private readonly cursors = new Map<string, IngestionCursor>();
  private readonly ingested = new Set<string>();
  private readonly replayToTask = new Map<string, string>();

  inspect(id: string): DurableTask | null {
    return this.tasks.get(id)?.task ?? null;
  }

  async enqueue(input: EnqueueTaskInput): Promise<{ task: DurableTask; created: boolean }> {
    const existingId = this.taskByIdempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.tasks.get(existingId)!.task;
      validateTaskIdentity(existing, input);
      return { task: existing, created: false };
    }
    if (this.tasks.has(input.id)) throw new Error(`task identity conflict: ${input.id}`);
    const now = input.now ?? Date.now();
    const task: DurableTask = {
      id: input.id,
      ...(input.dealRoomId ? { dealRoomId: input.dealRoomId } : {}),
      kind: input.kind,
      state: 'pending',
      idempotencyKey: input.idempotencyKey,
      version: 1,
      attempt: 0,
      maxAttempts: Math.max(1, Math.floor(input.maxAttempts ?? 8)),
      availableAt: input.availableAt,
      createdAt: now,
      updatedAt: now,
      data: input.data,
    };
    this.tasks.set(task.id, { task, checkpoints: [], leaseLosses: 0 });
    this.taskByIdempotency.set(task.idempotencyKey, task.id);
    return { task, created: true };
  }

  async enqueueFromTrigger(input: TriggeredTaskInput): Promise<{ task: DurableTask; created: boolean }> {
    const priorId = this.triggerToTask.get(input.triggerKey);
    if (priorId) {
      if (isMaterialReengagementTrigger(this.triggerKinds.get(input.triggerKey) ?? input.triggerKind)) {
        this.repeatedReengagements += 1;
      }
      const task = this.tasks.get(priorId)!.task;
      validateTaskIdentity(task, input.task);
      return { task, created: false };
    }
    const result = await this.enqueue({ ...input.task, now: input.now ?? input.task.now });
    this.triggerToTask.set(input.triggerKey, result.task.id);
    this.triggerKinds.set(input.triggerKey, input.triggerKind);
    return result;
  }

  async claimDue(input: { workerId: string; now: number; leaseMs: number; limit: number }): Promise<DurableTask[]> {
    for (const row of this.tasks.values()) {
      const task = row.task;
      if (
        (task.state === 'leased' || task.state === 'running') &&
        (task.leaseExpiresAt ?? Number.POSITIVE_INFINITY) <= input.now
      ) {
        row.leaseLosses += 1;
      }
      if (
        (task.state === 'leased' || task.state === 'running') &&
        (task.leaseExpiresAt ?? Number.POSITIVE_INFINITY) <= input.now &&
        task.attempt >= task.maxAttempts
      ) {
        row.task = {
          ...task,
          state: 'dead_letter',
          version: task.version + 1,
          deadLetteredAt: input.now,
          updatedAt: input.now,
          lastError: task.lastError ?? 'lease expired after maximum attempts',
          leaseOwner: undefined,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
        };
      }
    }
    const due = [...this.tasks.values()]
      .filter(({ task }) =>
        task.attempt < task.maxAttempts &&
        (((task.state === 'pending' || task.state === 'waiting' || task.state === 'failed') && task.availableAt <= input.now) ||
          ((task.state === 'leased' || task.state === 'running') && (task.leaseExpiresAt ?? 0) <= input.now)),
      )
      .sort((a, b) => a.task.availableAt - b.task.availableAt || a.task.createdAt - b.task.createdAt)
      .slice(0, Math.max(1, input.limit));
    return due.map((row) => {
      const attempt = row.task.attempt + 1;
      const leaseToken = `${input.workerId}:${row.task.id}:${attempt}:${input.now}`;
      row.task = {
        ...row.task,
        state: 'leased',
        version: row.task.version + 1,
        attempt,
        leaseOwner: input.workerId,
        leaseToken,
        leaseExpiresAt: input.now + Math.max(1_000, input.leaseMs),
        heartbeatAt: input.now,
        updatedAt: input.now,
      };
      return row.task;
    });
  }

  async start(lease: TaskLease, now: number): Promise<DurableTask> {
    const row = this.tasks.get(lease.taskId);
    const task = validateLease(row?.task, lease, now);
    if (task.state !== 'leased') throw new TaskLeaseLostError(lease.taskId);
    row!.task = { ...task, state: 'running', version: task.version + 1, updatedAt: now };
    return row!.task;
  }

  async heartbeat(lease: TaskLease, now: number, leaseMs: number): Promise<void> {
    const row = this.tasks.get(lease.taskId);
    const task = validateLease(row?.task, lease, now);
    row!.task = {
      ...task,
      heartbeatAt: now,
      leaseExpiresAt: now + Math.max(1_000, leaseMs),
      updatedAt: now,
    };
  }

  async listCheckpoints(taskId: string): Promise<TaskCheckpoint[]> {
    return [...(this.tasks.get(taskId)?.checkpoints ?? [])];
  }

  async checkpoint(
    lease: TaskLease,
    input: {
      checkpointKey: string;
      phase: TaskCheckpointPhase;
      externalId?: string;
      data: RuntimeData;
      now: number;
    },
  ): Promise<{ checkpoint: TaskCheckpoint; created: boolean }> {
    const row = this.tasks.get(lease.taskId);
    validateLease(row?.task, lease, input.now);
    const prior = row!.checkpoints.find((item) => item.checkpointKey === input.checkpointKey);
    if (prior) {
      if (!checkpointMatches(prior, input)) {
        throw new TaskCheckpointConflictError(lease.taskId, input.checkpointKey);
      }
      return { checkpoint: prior, created: false };
    }
    const checkpoint: TaskCheckpoint = {
      id: `${lease.taskId}:checkpoint:${input.checkpointKey}`,
      taskId: lease.taskId,
      checkpointKey: input.checkpointKey,
      sequence: row!.checkpoints.length + 1,
      phase: input.phase,
      ...(input.externalId ? { externalId: input.externalId } : {}),
      createdAt: input.now,
      data: input.data,
    };
    row!.checkpoints.push(checkpoint);
    return { checkpoint, created: true };
  }

  async complete(lease: TaskLease, now: number): Promise<DurableTask> {
    return this.finish(lease, 'succeeded', now, now);
  }

  async reschedule(lease: TaskLease, availableAt: number, now: number): Promise<DurableTask> {
    return this.finish(lease, 'waiting', now, availableAt);
  }

  async fail(lease: TaskLease, input: { now: number; nextAvailableAt: number; error: string }): Promise<DurableTask> {
    const row = this.tasks.get(lease.taskId);
    const task = validateLease(row?.task, lease, input.now);
    const deadLetter = task.attempt >= task.maxAttempts;
    row!.task = {
      ...task,
      state: deadLetter ? 'dead_letter' : 'failed',
      version: task.version + 1,
      availableAt: input.nextAvailableAt,
      updatedAt: input.now,
      lastError: input.error.slice(0, 1_000),
      ...(deadLetter ? { deadLetteredAt: input.now } : {}),
      leaseOwner: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      heartbeatAt: undefined,
    };
    return row!.task;
  }

  async recordIngestedEvent(input: {
    source: string;
    eventKey: string;
    partitionKey: string;
    cursor: string;
    expectedCursorVersion: number;
    data: RuntimeData;
    now?: number;
  }): Promise<{ duplicate: boolean; cursor: IngestionCursor | null }> {
    const dedupeKey = `${input.source}:${input.eventKey}`;
    const cursorKey = `${input.source}:${input.partitionKey}`;
    if (this.ingested.has(dedupeKey)) {
      return { duplicate: true, cursor: this.cursors.get(cursorKey) ?? null };
    }
    const current = this.cursors.get(cursorKey);
    if ((current?.version ?? 0) !== input.expectedCursorVersion) {
      throw new IngestionCursorConflictError(input.source, input.partitionKey, input.expectedCursorVersion);
    }
    const now = input.now ?? Date.now();
    const cursor: IngestionCursor = {
      source: input.source,
      partitionKey: input.partitionKey,
      cursor: input.cursor,
      version: (current?.version ?? 0) + 1,
      updatedAt: now,
      data: input.data,
    };
    this.ingested.add(dedupeKey);
    this.cursors.set(cursorKey, cursor);
    return { duplicate: false, cursor };
  }

  async listDeadLetters(limit = 100): Promise<DurableTask[]> {
    return [...this.tasks.values()]
      .map((row) => row.task)
      .filter((task) => task.state === 'dead_letter')
      .sort((a, b) => (b.deadLetteredAt ?? b.updatedAt) - (a.deadLetteredAt ?? a.updatedAt))
      .slice(0, Math.max(1, limit));
  }

  async get(taskId: string): Promise<DurableTask | null> {
    return this.tasks.get(taskId)?.task ?? null;
  }

  async replayDeadLetter(input: {
    taskId: string;
    replayKey: string;
    actor: string;
    now: number;
  }): Promise<{ task: DurableTask; replayed: boolean }> {
    void input.actor;
    const priorTaskId = this.replayToTask.get(input.replayKey);
    if (priorTaskId) {
      if (priorTaskId !== input.taskId) throw new DeadLetterReplayConflictError(input.replayKey);
      const prior = this.tasks.get(input.taskId)?.task;
      if (!prior) throw new DeadLetterReplayStateError(input.taskId, 'missing');
      return { task: prior, replayed: false };
    }
    const row = this.tasks.get(input.taskId);
    if (!row) throw new DeadLetterReplayStateError(input.taskId, 'missing');
    if (row.task.state !== 'dead_letter') {
      throw new DeadLetterReplayStateError(input.taskId, row.task.state);
    }
    this.replayToTask.set(input.replayKey, input.taskId);
    row.task = {
      ...row.task,
      state: 'pending',
      attempt: 0,
      version: row.task.version + 1,
      availableAt: input.now,
      leaseOwner: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      heartbeatAt: undefined,
      lastError: undefined,
      completedAt: undefined,
      deadLetteredAt: undefined,
      updatedAt: input.now,
    };
    return { task: row.task, replayed: true };
  }

  async summary(): Promise<DurableTaskAuditSummary> {
    const byState = emptyTaskAuditCounts();
    let leaseLosses = 0;
    for (const row of this.tasks.values()) {
      byState[row.task.state] += 1;
      leaseLosses += row.leaseLosses;
    }
    return {
      total: Object.values(byState).reduce((total, count) => total + count, 0),
      byState,
      retrying: byState.failed,
      deadLettered: byState.dead_letter,
      leaseLosses,
      repeatedReengagements: this.repeatedReengagements,
    };
  }

  async listRecent(input: { limit?: number; state?: AgentTaskState } = {}): Promise<readonly DurableTask[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    return [...this.tasks.values()]
      .map((row) => row.task)
      .filter((task) => !input.state || task.state === input.state)
      .sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))
      .slice(0, limit);
  }

  private async finish(
    lease: TaskLease,
    state: 'succeeded' | 'waiting',
    now: number,
    availableAt: number,
  ): Promise<DurableTask> {
    const row = this.tasks.get(lease.taskId);
    const task = validateLease(row?.task, lease, now);
    row!.task = {
      ...task,
      state,
      version: task.version + 1,
      availableAt,
      updatedAt: now,
      ...(state === 'succeeded' ? { completedAt: now, lastError: undefined } : {}),
      leaseOwner: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      heartbeatAt: undefined,
    };
    return row!.task;
  }
}

export interface DurableTaskContext {
  task: DurableTask;
  checkpoints: readonly TaskCheckpoint[];
  signal: AbortSignal;
  heartbeat(): Promise<void>;
  checkpoint(input: {
    checkpointKey: string;
    phase: TaskCheckpointPhase;
    externalId?: string;
    data?: RuntimeData;
  }): Promise<TaskCheckpoint>;
}

export type DurableTaskHandler = (
  context: DurableTaskContext,
) => Promise<{ state: 'succeeded' } | { state: 'waiting'; availableAt: number }>;

export interface DurableTaskRunSummary {
  succeeded: number;
  waiting: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
}

export function taskBackoffMs(attempt: number, baseMs = 1_000, capMs = 5 * 60_000): number {
  const exponent = Math.max(0, Math.min(20, Math.floor(attempt) - 1));
  return Math.min(capMs, baseMs * 2 ** exponent);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

export class DurableTaskRunner {
  constructor(
    private readonly store: DurableTaskStore,
    private readonly handlers: Readonly<Record<string, DurableTaskHandler>>,
    private readonly options: {
      workerId: string;
      leaseMs?: number;
      heartbeatMs?: number;
      batchSize?: number;
      baseBackoffMs?: number;
      maxBackoffMs?: number;
      clock?: () => number;
      onError?: (error: unknown, task?: DurableTask) => void;
    },
  ) {}

  async runOnce(now = this.options.clock?.() ?? Date.now()): Promise<DurableTaskRunSummary> {
    const leaseMs = Math.max(1_000, this.options.leaseMs ?? 30_000);
    const tasks = await this.store.claimDue({
      workerId: this.options.workerId,
      now,
      leaseMs,
      limit: this.options.batchSize ?? 10,
    });
    const summary: DurableTaskRunSummary = {
      succeeded: 0,
      waiting: 0,
      retried: 0,
      deadLettered: 0,
      leaseLost: 0,
    };
    for (const claimed of tasks) {
      const lease: TaskLease = {
        taskId: claimed.id,
        workerId: this.options.workerId,
        leaseToken: claimed.leaseToken!,
      };
      let task = claimed;
      let heartbeatBusy = false;
      let heartbeatError: unknown;
      let heartbeatPromise: Promise<void> | null = null;
      const controller = new AbortController();
      try {
        task = await this.store.start(lease, now);
        const checkpoints = await this.store.listCheckpoints(task.id);
        const handler = this.handlers[task.kind];
        if (!handler) throw new Error(`no durable task handler registered: ${task.kind}`);
        const heartbeat = async () => {
          const heartbeatNow = this.options.clock?.() ?? Date.now();
          await this.store.heartbeat(lease, heartbeatNow, leaseMs);
        };
        const heartbeatMs = Math.max(250, Math.min(leaseMs / 2, this.options.heartbeatMs ?? leaseMs / 3));
        const timer = setInterval(() => {
          if (heartbeatBusy || heartbeatError) return;
          heartbeatBusy = true;
          heartbeatPromise = heartbeat()
            .catch((error) => {
              heartbeatError = error;
              controller.abort(error);
            })
            .finally(() => {
              heartbeatBusy = false;
            });
        }, heartbeatMs);
        timer.unref?.();
        try {
          const result = await handler({
            task,
            checkpoints,
            signal: controller.signal,
            heartbeat,
            checkpoint: async (input) => {
              const saved = await this.store.checkpoint(lease, {
                ...input,
                data: input.data ?? {},
                now: this.options.clock?.() ?? Date.now(),
              });
              return saved.checkpoint;
            },
          });
          if (heartbeatPromise) await heartbeatPromise;
          if (heartbeatError) throw heartbeatError;
          const finishedAt = this.options.clock?.() ?? Date.now();
          if (result.state === 'waiting') {
            await this.store.reschedule(lease, result.availableAt, finishedAt);
            summary.waiting += 1;
          } else {
            await this.store.complete(lease, finishedAt);
            summary.succeeded += 1;
          }
        } finally {
          clearInterval(timer);
        }
      } catch (error) {
        this.options.onError?.(error, task);
        if (error instanceof TaskLeaseLostError) {
          summary.leaseLost += 1;
          continue;
        }
        try {
          const failedAt = this.options.clock?.() ?? now;
          const failed = await this.store.fail(lease, {
            now: failedAt,
            nextAvailableAt:
              failedAt + taskBackoffMs(task.attempt, this.options.baseBackoffMs, this.options.maxBackoffMs),
            error: errorMessage(error),
          });
          if (failed.state === 'dead_letter') summary.deadLettered += 1;
          else summary.retried += 1;
        } catch (failureError) {
          this.options.onError?.(failureError, task);
          summary.leaseLost += 1;
        }
      }
    }
    return summary;
  }
}

export function startDurableTaskRunnerLoop(
  runner: Pick<DurableTaskRunner, 'runOnce'>,
  options: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
    onResult?: (summary: DurableTaskRunSummary) => void;
  } = {},
): () => void {
  let stopped = false;
  let inFlight = false;
  const run = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      options.onResult?.(await runner.runOnce());
    } catch (error) {
      options.onError?.(error);
    } finally {
      inFlight = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), Math.max(100, options.intervalMs ?? 1_000));
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export const MATERIAL_REENGAGEMENT_TRIGGERS = [
  'terms_changed',
  'mandate_changed',
  'evidence_confirmed',
  'capacity_changed',
  'deadline_changed',
  'funding_confirmed',
  'stake_confirmed',
  'user_requested',
] as const;

export const DEAL_ROOM_REENGAGEMENT_TASK = 'deal_room.reengage';

export type MaterialReengagementTrigger = (typeof MATERIAL_REENGAGEMENT_TRIGGERS)[number];

function isMaterialReengagementTrigger(value: string | undefined): value is MaterialReengagementTrigger {
  return value !== undefined
    && (MATERIAL_REENGAGEMENT_TRIGGERS as readonly string[]).includes(value);
}

export async function scheduleReengagement(
  store: DurableTaskStore,
  input: {
    dealRoomId: string;
    triggerKey: string;
    trigger: MaterialReengagementTrigger;
    sourceEventId?: string;
    cooldownUntil?: number;
    attemptNumber: number;
    now?: number;
    data?: RuntimeData;
  },
): Promise<{ task: DurableTask; created: boolean }> {
  if (!MATERIAL_REENGAGEMENT_TRIGGERS.includes(input.trigger)) {
    throw new Error(`unsupported re-engagement trigger: ${String(input.trigger)}`);
  }
  if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new Error('re-engagement attemptNumber must be a positive integer');
  }
  const now = input.now ?? Date.now();
  const availableAt = Math.max(now, input.cooldownUntil ?? now);
  return store.enqueueFromTrigger({
    triggerId: `trigger:${input.triggerKey}`,
    triggerKey: input.triggerKey,
    triggerKind: input.trigger,
    ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
    triggerData: input.data ?? {},
    now,
    task: {
      id: `task:reengage:${input.triggerKey}`,
      dealRoomId: input.dealRoomId,
      kind: DEAL_ROOM_REENGAGEMENT_TASK,
      idempotencyKey: `reengagement:${input.dealRoomId}:${input.triggerKey}`,
      availableAt,
      maxAttempts: 8,
      data: {
        trigger: input.trigger,
        attemptNumber: input.attemptNumber,
        ...(input.data ?? {}),
      },
      now,
    },
  });
}

export function latestExternalSubmission(
  checkpoints: readonly TaskCheckpoint[],
): TaskCheckpoint | null {
  return [...checkpoints]
    .reverse()
    .find((checkpoint) => checkpoint.phase === 'external.submitted' && checkpoint.externalId) ?? null;
}
