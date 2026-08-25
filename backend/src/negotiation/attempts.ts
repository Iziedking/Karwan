import type { SqlExecutor } from '../db/migrations.js';

export type NegotiationAttemptState = 'planned' | 'running' | 'waiting' | 'agreed' | 'temporary_impasse' | 'hard_rejected' | 'expired';
export type NegotiationTrigger = 'INITIAL_MATCH' | 'NEW_OFFER' | 'TERMS_CHANGED' | 'MANDATE_CHANGED' | 'STAKE_CONFIRMED' | 'FUNDS_CONFIRMED' | 'EVIDENCE_IMPROVED' | 'CAPACITY_AVAILABLE' | 'COOLDOWN_ELAPSED' | 'DEADLINE_WINDOW' | 'USER_REQUESTED';

export interface NegotiationAttemptRecord {
  id: string;
  dealRoomId: string;
  attemptNumber: number;
  trigger: NegotiationTrigger;
  triggerReference: string;
  strategy: Readonly<Record<string, unknown>>;
  state: NegotiationAttemptState;
  priorOfferVersion?: number;
  version: number;
  availableAt?: number;
  createdAt: number;
  updatedAt: number;
  data: Readonly<Record<string, unknown>>;
}

export interface CreateNegotiationAttempt {
  id: string;
  dealRoomId: string;
  attemptNumber: number;
  trigger: NegotiationTrigger;
  triggerReference: string;
  strategy: Readonly<Record<string, unknown>>;
  priorOfferVersion?: number;
  availableAt?: number;
  data?: Readonly<Record<string, unknown>>;
  now?: number;
}

export class NegotiationAttemptConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NegotiationAttemptConflict';
  }
}

const transitions: Readonly<Record<NegotiationAttemptState, readonly NegotiationAttemptState[]>> = {
  planned: ['running', 'waiting', 'temporary_impasse', 'agreed', 'hard_rejected', 'expired'],
  running: ['waiting', 'agreed', 'temporary_impasse', 'hard_rejected', 'expired'],
  waiting: ['planned', 'running', 'expired'],
  agreed: [],
  temporary_impasse: [],
  hard_rejected: [],
  expired: [],
};

function transition(current: NegotiationAttemptState, next: NegotiationAttemptState): void {
  if (current !== next && !transitions[current].includes(next)) throw new NegotiationAttemptConflict(`invalid negotiation attempt transition ${current} -> ${next}`);
}

function reentryKey(input: { dealRoomId: string; trigger: NegotiationTrigger; triggerReference: string }): string {
  return `${input.dealRoomId}:${input.trigger}:${input.triggerReference}`;
}

export interface NegotiationAttemptStore {
  create(input: CreateNegotiationAttempt): Promise<NegotiationAttemptRecord>;
  get(id: string): Promise<NegotiationAttemptRecord | null>;
  list(dealRoomId: string): Promise<readonly NegotiationAttemptRecord[]>;
  update(id: string, expectedVersion: number, state: NegotiationAttemptState, data?: Readonly<Record<string, unknown>>, now?: number): Promise<NegotiationAttemptRecord>;
}

export class InMemoryNegotiationAttemptStore implements NegotiationAttemptStore {
  private readonly records = new Map<string, NegotiationAttemptRecord>();
  private readonly reentries = new Map<string, string>();

  async create(input: CreateNegotiationAttempt): Promise<NegotiationAttemptRecord> {
    if (this.records.has(input.id)) throw new NegotiationAttemptConflict(`duplicate attempt id ${input.id}`);
    if (input.attemptNumber <= 0 || !Number.isInteger(input.attemptNumber)) throw new NegotiationAttemptConflict('invalid attempt number');
    const key = reentryKey(input);
    const prior = this.reentries.get(key);
    if (prior) return this.records.get(prior)!;
    const now = input.now ?? Date.now();
    const record: NegotiationAttemptRecord = {
      id: input.id, dealRoomId: input.dealRoomId, attemptNumber: input.attemptNumber,
      trigger: input.trigger, triggerReference: input.triggerReference, strategy: input.strategy,
      state: 'planned', ...(input.priorOfferVersion === undefined ? {} : { priorOfferVersion: input.priorOfferVersion }),
      version: 1, ...(input.availableAt === undefined ? {} : { availableAt: input.availableAt }),
      createdAt: now, updatedAt: now, data: { ...(input.data ?? {}), reentryKey: key },
    };
    this.records.set(record.id, record);
    this.reentries.set(key, record.id);
    return record;
  }

  async get(id: string): Promise<NegotiationAttemptRecord | null> { return this.records.get(id) ?? null; }

  async list(dealRoomId: string): Promise<readonly NegotiationAttemptRecord[]> {
    return [...this.records.values()].filter((record) => record.dealRoomId === dealRoomId).sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  async update(id: string, expectedVersion: number, state: NegotiationAttemptState, data?: Readonly<Record<string, unknown>>, now = Date.now()): Promise<NegotiationAttemptRecord> {
    const current = this.records.get(id);
    if (!current || current.version !== expectedVersion) throw new NegotiationAttemptConflict(`stale negotiation attempt ${id}`);
    transition(current.state, state);
    const next: NegotiationAttemptRecord = { ...current, state, version: current.version + 1, updatedAt: now, data: data ? { ...current.data, ...data } : current.data };
    this.records.set(id, next);
    return next;
  }
}

interface AttemptRow extends Record<string, unknown> {
  id: string;
  deal_room_id: string;
  attempt_number: number | string;
  trigger: NegotiationTrigger;
  strategy: string;
  state: NegotiationAttemptState;
  prior_offer_version?: number | string | null;
  version: number | string;
  available_at?: number | string | null;
  created_at: number | string;
  updated_at: number | string;
  data: Readonly<Record<string, unknown>>;
}

function int(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${label}`);
  return parsed;
}

function fromRow(row: AttemptRow): NegotiationAttemptRecord {
  const strategy = JSON.parse(row.strategy) as Readonly<Record<string, unknown>>;
  return {
    id: row.id, dealRoomId: row.deal_room_id, attemptNumber: int(row.attempt_number, 'attempt number'), trigger: row.trigger,
    triggerReference: String(row.data.triggerReference ?? ''), strategy, state: row.state,
    ...(row.prior_offer_version == null ? {} : { priorOfferVersion: int(row.prior_offer_version, 'prior offer version') }),
    version: int(row.version, 'attempt version'), ...(row.available_at == null ? {} : { availableAt: int(row.available_at, 'available at') }),
    createdAt: int(row.created_at, 'created at'), updatedAt: int(row.updated_at, 'updated at'), data: row.data,
  };
}

export class PostgresNegotiationAttemptStore implements NegotiationAttemptStore {
  constructor(private readonly executor: SqlExecutor) {}

  async create(input: CreateNegotiationAttempt): Promise<NegotiationAttemptRecord> {
    const now = input.now ?? Date.now();
    const key = reentryKey(input);
    const existing = await this.executor.query<AttemptRow>(
      `SELECT * FROM negotiation_attempts WHERE deal_room_id = $1 AND data ->> 'reentryKey' = $2`,
      [input.dealRoomId, key],
    );
    if (existing.rows[0]) return fromRow(existing.rows[0]);
    const data = { ...(input.data ?? {}), reentryKey: key, triggerReference: input.triggerReference };
    try {
      const result = await this.executor.query<AttemptRow>(
        `INSERT INTO negotiation_attempts
          (id, deal_room_id, attempt_number, trigger, strategy, state, prior_offer_version, version, available_at, created_at, updated_at, data)
         VALUES ($1, $2, $3, $4, $5, 'planned', $6, 1, $7, $8, $8, $9)
         RETURNING *`,
        [input.id, input.dealRoomId, input.attemptNumber, input.trigger, JSON.stringify(input.strategy), input.priorOfferVersion ?? null, input.availableAt ?? null, now, data],
      );
      return fromRow(result.rows[0]!);
    } catch (error) {
      const retry = await this.executor.query<AttemptRow>(
        `SELECT * FROM negotiation_attempts WHERE deal_room_id = $1 AND data ->> 'reentryKey' = $2`,
        [input.dealRoomId, key],
      );
      if (retry.rows[0]) return fromRow(retry.rows[0]);
      throw error;
    }
  }

  async get(id: string): Promise<NegotiationAttemptRecord | null> {
    const result = await this.executor.query<AttemptRow>('SELECT * FROM negotiation_attempts WHERE id = $1', [id]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async list(dealRoomId: string): Promise<readonly NegotiationAttemptRecord[]> {
    const result = await this.executor.query<AttemptRow>('SELECT * FROM negotiation_attempts WHERE deal_room_id = $1 ORDER BY attempt_number ASC', [dealRoomId]);
    return result.rows.map(fromRow);
  }

  async update(id: string, expectedVersion: number, state: NegotiationAttemptState, data?: Readonly<Record<string, unknown>>, now = Date.now()): Promise<NegotiationAttemptRecord> {
    const current = await this.get(id);
    if (!current || current.version !== expectedVersion) throw new NegotiationAttemptConflict(`stale negotiation attempt ${id}`);
    transition(current.state, state);
    const result = await this.executor.query<AttemptRow>(
      `UPDATE negotiation_attempts SET state = $3, version = version + 1, updated_at = $4, data = $5
       WHERE id = $1 AND version = $2 RETURNING *`,
      [id, expectedVersion, state, now, data ? { ...current.data, ...data } : current.data],
    );
    if (!result.rows[0]) throw new NegotiationAttemptConflict(`stale negotiation attempt ${id}`);
    return fromRow(result.rows[0]);
  }
}
