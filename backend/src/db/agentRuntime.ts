import {
  transitionAgentTask,
  transitionApproval,
  transitionDealRoom,
  transitionOffer,
  type AgentTaskState,
  type ApprovalState,
  type DealRoomState,
  type OfferState,
} from '../domain/agentRuntimeState.js';
import type { SqlExecutor } from './migrations.js';

export type RuntimeData = Readonly<Record<string, unknown>>;

interface RuntimeRecord<TState extends string> {
  id: string;
  state: TState;
  version: number;
  createdAt: number;
  updatedAt: number;
  data: RuntimeData;
}

export interface DealRoomRecord extends RuntimeRecord<DealRoomState> {
  jobId: string;
}

export interface OfferRecord extends RuntimeRecord<OfferState> {
  dealRoomId: string;
  offerVersion: number;
  proposer: string;
  expiresAt?: number;
}

export interface AgentTaskRecord extends RuntimeRecord<AgentTaskState> {
  dealRoomId?: string;
  kind: string;
  idempotencyKey: string;
  attempt: number;
  availableAt: number;
}

export interface ApprovalRecord extends RuntimeRecord<ApprovalState> {
  dealRoomId: string;
  requestKey: string;
  kind: string;
  expiresAt?: number;
}

export class OptimisticConcurrencyError extends Error {
  constructor(entity: string, id: string, expectedVersion: number) {
    super(`${entity} ${id} did not match expected version ${expectedVersion}`);
    this.name = 'OptimisticConcurrencyError';
  }
}

export class RuntimeDuplicateError extends Error {
  constructor(boundary: string) {
    super(`duplicate agent runtime boundary: ${boundary}`);
    this.name = 'RuntimeDuplicateError';
  }
}

export interface AgentRuntimeRepository {
  createDealRoom(input: Omit<DealRoomRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number }): Promise<DealRoomRecord>;
  getDealRoom(id: string): Promise<DealRoomRecord | null>;
  updateDealRoom(id: string, expectedVersion: number, nextState: DealRoomState, data?: RuntimeData, now?: number): Promise<DealRoomRecord>;
  createOffer(input: Omit<OfferRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number }): Promise<OfferRecord>;
  getOffer(id: string): Promise<OfferRecord | null>;
  updateOffer(id: string, expectedVersion: number, nextState: OfferState, data?: RuntimeData, now?: number): Promise<OfferRecord>;
  createTask(input: Omit<AgentTaskRecord, 'state' | 'version' | 'createdAt' | 'updatedAt' | 'attempt'> & { now?: number }): Promise<AgentTaskRecord>;
  getTask(id: string): Promise<AgentTaskRecord | null>;
  updateTask(id: string, expectedVersion: number, nextState: AgentTaskState, data?: RuntimeData, now?: number): Promise<AgentTaskRecord>;
  createApproval(input: Omit<ApprovalRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number }): Promise<ApprovalRecord>;
  getApproval(id: string): Promise<ApprovalRecord | null>;
  updateApproval(id: string, expectedVersion: number, nextState: ApprovalState, data?: RuntimeData, now?: number): Promise<ApprovalRecord>;
}

function mergeData(current: RuntimeData, patch?: RuntimeData): RuntimeData {
  return patch ? { ...current, ...patch } : current;
}

function applyDataPatch<TState extends string, TRecord extends RuntimeRecord<TState>>(
  current: TRecord,
  transitioned: TRecord,
  data: RuntimeData | undefined,
  now: number,
): TRecord {
  if (!data) return transitioned;
  if (transitioned === current) {
    return {
      ...current,
      data: mergeData(current.data, data),
      version: current.version + 1,
      updatedAt: now,
    };
  }
  return { ...transitioned, data: mergeData(current.data, data) };
}

export class InMemoryAgentRuntimeRepository implements AgentRuntimeRepository {
  private readonly rooms = new Map<string, DealRoomRecord>();
  private readonly roomByJob = new Map<string, string>();
  private readonly offers = new Map<string, OfferRecord>();
  private readonly offerByRoomVersion = new Map<string, string>();
  private readonly tasks = new Map<string, AgentTaskRecord>();
  private readonly taskByIdempotencyKey = new Map<string, string>();
  private readonly approvals = new Map<string, ApprovalRecord>();
  private readonly approvalByRequestKey = new Map<string, string>();

  async createDealRoom(
    input: Omit<DealRoomRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number },
  ): Promise<DealRoomRecord> {
    if (this.rooms.has(input.id)) throw new RuntimeDuplicateError(`deal_room.id:${input.id}`);
    if (this.roomByJob.has(input.jobId)) throw new RuntimeDuplicateError(`deal_room.job_id:${input.jobId}`);
    const now = input.now ?? Date.now();
    const record: DealRoomRecord = { id: input.id, jobId: input.jobId, data: input.data, state: 'open', version: 1, createdAt: now, updatedAt: now };
    this.rooms.set(record.id, record);
    this.roomByJob.set(record.jobId, record.id);
    return record;
  }

  async getDealRoom(id: string): Promise<DealRoomRecord | null> {
    return this.rooms.get(id) ?? null;
  }

  async updateDealRoom(id: string, expectedVersion: number, nextState: DealRoomState, data?: RuntimeData, now = Date.now()): Promise<DealRoomRecord> {
    const current = this.rooms.get(id);
    if (!current || current.version !== expectedVersion) throw new OptimisticConcurrencyError('deal room', id, expectedVersion);
    const next = applyDataPatch(current, transitionDealRoom(current, nextState, now), data, now);
    this.rooms.set(id, next);
    return next;
  }

  async createOffer(
    input: Omit<OfferRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number },
  ): Promise<OfferRecord> {
    const boundary = `${input.dealRoomId}:${input.offerVersion}`;
    if (this.offers.has(input.id)) throw new RuntimeDuplicateError(`offer.id:${input.id}`);
    if (this.offerByRoomVersion.has(boundary)) throw new RuntimeDuplicateError(`offer.version:${boundary}`);
    const now = input.now ?? Date.now();
    const record: OfferRecord = {
      id: input.id,
      dealRoomId: input.dealRoomId,
      offerVersion: input.offerVersion,
      proposer: input.proposer,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      data: input.data,
      state: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.offers.set(record.id, record);
    this.offerByRoomVersion.set(boundary, record.id);
    return record;
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    return this.offers.get(id) ?? null;
  }

  async updateOffer(id: string, expectedVersion: number, nextState: OfferState, data?: RuntimeData, now = Date.now()): Promise<OfferRecord> {
    const current = this.offers.get(id);
    if (!current || current.version !== expectedVersion) throw new OptimisticConcurrencyError('offer', id, expectedVersion);
    const next = applyDataPatch(current, transitionOffer(current, nextState, now), data, now);
    this.offers.set(id, next);
    return next;
  }

  async createTask(
    input: Omit<AgentTaskRecord, 'state' | 'version' | 'createdAt' | 'updatedAt' | 'attempt'> & { now?: number },
  ): Promise<AgentTaskRecord> {
    if (this.tasks.has(input.id)) throw new RuntimeDuplicateError(`task.id:${input.id}`);
    if (this.taskByIdempotencyKey.has(input.idempotencyKey)) throw new RuntimeDuplicateError(`task.idempotency:${input.idempotencyKey}`);
    const now = input.now ?? Date.now();
    const record: AgentTaskRecord = {
      id: input.id,
      ...(input.dealRoomId === undefined ? {} : { dealRoomId: input.dealRoomId }),
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      availableAt: input.availableAt,
      data: input.data,
      state: 'pending',
      version: 1,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(record.id, record);
    this.taskByIdempotencyKey.set(record.idempotencyKey, record.id);
    return record;
  }

  async getTask(id: string): Promise<AgentTaskRecord | null> {
    return this.tasks.get(id) ?? null;
  }

  async updateTask(id: string, expectedVersion: number, nextState: AgentTaskState, data?: RuntimeData, now = Date.now()): Promise<AgentTaskRecord> {
    const current = this.tasks.get(id);
    if (!current || current.version !== expectedVersion) throw new OptimisticConcurrencyError('agent task', id, expectedVersion);
    const next = applyDataPatch(current, transitionAgentTask(current, nextState, now), data, now);
    this.tasks.set(id, next);
    return next;
  }

  async createApproval(
    input: Omit<ApprovalRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number },
  ): Promise<ApprovalRecord> {
    if (this.approvals.has(input.id)) throw new RuntimeDuplicateError(`approval.id:${input.id}`);
    if (this.approvalByRequestKey.has(input.requestKey)) throw new RuntimeDuplicateError(`approval.request:${input.requestKey}`);
    const now = input.now ?? Date.now();
    const record: ApprovalRecord = {
      id: input.id,
      dealRoomId: input.dealRoomId,
      requestKey: input.requestKey,
      kind: input.kind,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      data: input.data,
      state: 'requested',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.approvals.set(record.id, record);
    this.approvalByRequestKey.set(record.requestKey, record.id);
    return record;
  }

  async getApproval(id: string): Promise<ApprovalRecord | null> {
    return this.approvals.get(id) ?? null;
  }

  async updateApproval(id: string, expectedVersion: number, nextState: ApprovalState, data?: RuntimeData, now = Date.now()): Promise<ApprovalRecord> {
    const current = this.approvals.get(id);
    if (!current || current.version !== expectedVersion) throw new OptimisticConcurrencyError('approval', id, expectedVersion);
    const next = applyDataPatch(current, transitionApproval(current, nextState, now), data, now);
    this.approvals.set(id, next);
    return next;
  }
}

interface DbRow extends Record<string, unknown> {
  id: string;
  state: string;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
  data: RuntimeData;
}

function numberColumn(value: number | string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`unsafe database integer: ${String(value)}`);
  return result;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class PostgresAgentRuntimeRepository implements AgentRuntimeRepository {
  constructor(private readonly executor: SqlExecutor) {}

  async createDealRoom(input: Omit<DealRoomRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number }): Promise<DealRoomRecord> {
    const now = input.now ?? Date.now();
    try {
      const result = await this.executor.query<DbRow>(
        `INSERT INTO deal_rooms (id, job_id, state, version, created_at, updated_at, data)
         VALUES ($1, $2, 'open', 1, $3, $3, $4) RETURNING *`,
        [input.id, input.jobId, now, input.data],
      );
      return roomFrom(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new RuntimeDuplicateError(`deal_room:${input.jobId}`);
      throw error;
    }
  }

  async getDealRoom(id: string): Promise<DealRoomRecord | null> {
    const result = await this.executor.query<DbRow>('SELECT * FROM deal_rooms WHERE id = $1', [id]);
    return result.rows[0] ? roomFrom(result.rows[0]) : null;
  }

  async updateDealRoom(id: string, expectedVersion: number, nextState: DealRoomState, data?: RuntimeData, now = Date.now()): Promise<DealRoomRecord> {
    const current = await this.requireDealRoom(id, expectedVersion);
    const transitioned = transitionDealRoom(current, nextState, now);
    if (transitioned === current && !data) return current;
    const result = await this.executor.query<DbRow>(
      `UPDATE deal_rooms SET state = $3, version = version + 1, updated_at = $4, data = $5
       WHERE id = $1 AND version = $2 RETURNING *`,
      [id, expectedVersion, nextState, now, mergeData(current.data, data)],
    );
    if (!result.rows[0]) throw new OptimisticConcurrencyError('deal room', id, expectedVersion);
    return roomFrom(result.rows[0]);
  }

  async createOffer(input: Omit<OfferRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number }): Promise<OfferRecord> {
    const now = input.now ?? Date.now();
    try {
      const result = await this.executor.query<DbRow>(
        `INSERT INTO offers (id, deal_room_id, offer_version, state, proposer, version, created_at, updated_at, expires_at, data)
         VALUES ($1, $2, $3, 'draft', $4, 1, $5, $5, $6, $7) RETURNING *`,
        [input.id, input.dealRoomId, input.offerVersion, input.proposer, now, input.expiresAt ?? null, input.data],
      );
      return offerFrom(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new RuntimeDuplicateError(`offer:${input.dealRoomId}:${input.offerVersion}`);
      throw error;
    }
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    const result = await this.executor.query<DbRow>('SELECT * FROM offers WHERE id = $1', [id]);
    return result.rows[0] ? offerFrom(result.rows[0]) : null;
  }

  async updateOffer(id: string, expectedVersion: number, nextState: OfferState, data?: RuntimeData, now = Date.now()): Promise<OfferRecord> {
    return this.updateVersioned('offers', 'offer', id, expectedVersion, nextState, data, now, transitionOffer, offerFrom);
  }

  async createTask(input: Omit<AgentTaskRecord, 'state' | 'version' | 'createdAt' | 'updatedAt' | 'attempt'> & { now?: number }): Promise<AgentTaskRecord> {
    const now = input.now ?? Date.now();
    try {
      const result = await this.executor.query<DbRow>(
        `INSERT INTO agent_tasks (id, deal_room_id, kind, state, idempotency_key, version, attempt, available_at, created_at, updated_at, data)
         VALUES ($1, $2, $3, 'pending', $4, 1, 0, $5, $6, $6, $7) RETURNING *`,
        [input.id, input.dealRoomId ?? null, input.kind, input.idempotencyKey, input.availableAt, now, input.data],
      );
      return taskFrom(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new RuntimeDuplicateError(`task:${input.idempotencyKey}`);
      throw error;
    }
  }

  async getTask(id: string): Promise<AgentTaskRecord | null> {
    const result = await this.executor.query<DbRow>('SELECT * FROM agent_tasks WHERE id = $1', [id]);
    return result.rows[0] ? taskFrom(result.rows[0]) : null;
  }

  async updateTask(id: string, expectedVersion: number, nextState: AgentTaskState, data?: RuntimeData, now = Date.now()): Promise<AgentTaskRecord> {
    return this.updateVersioned('agent_tasks', 'agent task', id, expectedVersion, nextState, data, now, transitionAgentTask, taskFrom);
  }

  async createApproval(input: Omit<ApprovalRecord, 'state' | 'version' | 'createdAt' | 'updatedAt'> & { now?: number }): Promise<ApprovalRecord> {
    const now = input.now ?? Date.now();
    try {
      const result = await this.executor.query<DbRow>(
        `INSERT INTO approvals (id, deal_room_id, request_key, kind, state, version, expires_at, created_at, updated_at, data)
         VALUES ($1, $2, $3, $4, 'requested', 1, $5, $6, $6, $7) RETURNING *`,
        [input.id, input.dealRoomId, input.requestKey, input.kind, input.expiresAt ?? null, now, input.data],
      );
      return approvalFrom(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new RuntimeDuplicateError(`approval:${input.requestKey}`);
      throw error;
    }
  }

  async getApproval(id: string): Promise<ApprovalRecord | null> {
    const result = await this.executor.query<DbRow>('SELECT * FROM approvals WHERE id = $1', [id]);
    return result.rows[0] ? approvalFrom(result.rows[0]) : null;
  }

  async updateApproval(id: string, expectedVersion: number, nextState: ApprovalState, data?: RuntimeData, now = Date.now()): Promise<ApprovalRecord> {
    return this.updateVersioned('approvals', 'approval', id, expectedVersion, nextState, data, now, transitionApproval, approvalFrom);
  }

  private async requireDealRoom(id: string, expectedVersion: number): Promise<DealRoomRecord> {
    const current = await this.getDealRoom(id);
    if (!current || current.version !== expectedVersion) throw new OptimisticConcurrencyError('deal room', id, expectedVersion);
    return current;
  }

  private async updateVersioned<TState extends string, TRecord extends RuntimeRecord<TState>>(
    table: 'offers' | 'agent_tasks' | 'approvals',
    label: string,
    id: string,
    expectedVersion: number,
    nextState: TState,
    data: RuntimeData | undefined,
    now: number,
    transition: (record: TRecord, state: TState, timestamp: number) => TRecord,
    map: (row: DbRow) => TRecord,
  ): Promise<TRecord> {
    const currentResult = await this.executor.query<DbRow>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    const current = currentResult.rows[0] ? map(currentResult.rows[0]) : null;
    if (!current || current.version !== expectedVersion) throw new OptimisticConcurrencyError(label, id, expectedVersion);
    const transitioned = transition(current, nextState, now);
    if (transitioned === current && !data) return current;
    const result = await this.executor.query<DbRow>(
      `UPDATE ${table} SET state = $3, version = version + 1, updated_at = $4, data = $5
       WHERE id = $1 AND version = $2 RETURNING *`,
      [id, expectedVersion, nextState, now, mergeData(current.data, data)],
    );
    if (!result.rows[0]) throw new OptimisticConcurrencyError(label, id, expectedVersion);
    return map(result.rows[0]);
  }
}

function baseFrom<TState extends string>(row: DbRow): RuntimeRecord<TState> {
  return {
    id: row.id,
    state: row.state as TState,
    version: numberColumn(row.version),
    createdAt: numberColumn(row.created_at),
    updatedAt: numberColumn(row.updated_at),
    data: row.data,
  };
}

function roomFrom(row: DbRow): DealRoomRecord {
  return { ...baseFrom<DealRoomState>(row), jobId: String(row.job_id) };
}

function offerFrom(row: DbRow): OfferRecord {
  const expiresAt = row.expires_at == null ? undefined : numberColumn(row.expires_at as number | string);
  return {
    ...baseFrom<OfferState>(row),
    dealRoomId: String(row.deal_room_id),
    offerVersion: numberColumn(row.offer_version as number | string),
    proposer: String(row.proposer),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

function taskFrom(row: DbRow): AgentTaskRecord {
  const dealRoomId = row.deal_room_id == null ? undefined : String(row.deal_room_id);
  return {
    ...baseFrom<AgentTaskState>(row),
    ...(dealRoomId === undefined ? {} : { dealRoomId }),
    kind: String(row.kind),
    idempotencyKey: String(row.idempotency_key),
    attempt: numberColumn(row.attempt as number | string),
    availableAt: numberColumn(row.available_at as number | string),
  };
}

function approvalFrom(row: DbRow): ApprovalRecord {
  const expiresAt = row.expires_at == null ? undefined : numberColumn(row.expires_at as number | string);
  return {
    ...baseFrom<ApprovalState>(row),
    dealRoomId: String(row.deal_room_id),
    requestKey: String(row.request_key),
    kind: String(row.kind),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}
