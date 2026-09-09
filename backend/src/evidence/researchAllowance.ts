import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';

export const DEFAULT_RESEARCH_ALLOWANCE = 3;
export const DEFAULT_RESEARCH_SCOPE = 'counterparty-report';
export const DEFAULT_RESERVATION_LEASE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResearchAllowanceSnapshot {
  scope: string;
  periodStart: number;
  allowance: number;
  used: number;
  reserved: number;
  remaining: number;
  version: number;
  updatedAt: number;
}

export interface AgentKitBindingRecord {
  agentAddress: string;
  humanKeyDigest: string;
  verifier: 'world-agentbook';
  checkedAt: number;
  expiresAt: number;
  version: number;
  updatedAt: number;
}

export type ResearchReservationState = 'reserved' | 'delivered' | 'released';

export interface ResearchReservationRecord {
  id: string;
  attemptToken: string;
  humanKeyDigest: string;
  agentAddress: string;
  scope: string;
  periodStart: number;
  resourceId: string;
  state: ResearchReservationState;
  leaseExpiresAt: number;
  resultId?: string;
  result?: unknown;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
  deliveredAt?: number;
}

interface VerifyBindingInput {
  humanKeyDigest: string;
  agentAddress: string;
  verifier: 'world-agentbook';
  checkedAt: number;
  expiresAt: number;
  domain: string;
  nonce: string;
  nonceExpiresAt: number;
  now?: number;
}

interface ReserveInput {
  agentAddress: string;
  requestId: string;
  resourceId: string;
  scope?: string;
  allowance?: number;
  leaseMs?: number;
  now?: number;
}

export interface ResearchAllowanceStore {
  verifyBinding(input: VerifyBindingInput): Promise<AgentKitBindingRecord>;
  reserve(input: ReserveInput): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot; created: boolean }>;
  commit(input: { reservationId: string; attemptToken: string; resultId: string; result?: unknown; now?: number }): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot }>;
  release(input: { reservationId: string; attemptToken: string; reason: string; now?: number }): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot }>;
  getDelivered(input: { agentAddress: string; resourceId: string; scope?: string }): Promise<ResearchReservationRecord | null>;
  get(input: { humanKeyDigest: string; scope?: string; now?: number }): Promise<ResearchAllowanceSnapshot | null>;
  getBinding(agentAddress: string): Promise<AgentKitBindingRecord | null>;
  listBindings(humanKeyDigest: string): Promise<readonly AgentKitBindingRecord[]>;
}

export class ResearchAllowanceReplayError extends Error {
  constructor() {
    super('agent proof nonce has already been consumed');
    this.name = 'ResearchAllowanceReplayError';
  }
}

export class ResearchAllowanceExpiredError extends Error {
  constructor(message = 'agent proof nonce has expired') {
    super(message);
    this.name = 'ResearchAllowanceExpiredError';
  }
}

export class ResearchAllowanceExhaustedError extends Error {
  constructor() {
    super('research allowance is exhausted');
    this.name = 'ResearchAllowanceExhaustedError';
  }
}

export class ResearchAllowanceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchAllowanceConflictError';
  }
}

function digest(value: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new ResearchAllowanceConflictError('human key digest is invalid');
  return value.toLowerCase();
}

function address(value: string): string {
  if (!/^0x[0-9a-f]{40}$/i.test(value.trim())) throw new ResearchAllowanceConflictError('agent address is invalid');
  return value.trim().toLowerCase();
}

function identifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f]/.test(normalized)) {
    throw new ResearchAllowanceConflictError(`${label} is invalid`);
  }
  return normalized;
}

function scope(value?: string): string {
  const normalized = (value ?? DEFAULT_RESEARCH_SCOPE).trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(normalized)) throw new ResearchAllowanceConflictError('research scope is invalid');
  return normalized;
}

function periodStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

function allowanceValue(value?: number): number {
  const normalized = value ?? DEFAULT_RESEARCH_ALLOWANCE;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new ResearchAllowanceConflictError('research allowance is invalid');
  }
  return normalized;
}

function leaseValue(value?: number): number {
  const normalized = value ?? DEFAULT_RESERVATION_LEASE_MS;
  if (!Number.isSafeInteger(normalized) || normalized < 1_000 || normalized > 10 * 60_000) {
    throw new ResearchAllowanceConflictError('research reservation lease is invalid');
  }
  return normalized;
}

function snapshot(input: Omit<ResearchAllowanceSnapshot, 'remaining'>): ResearchAllowanceSnapshot {
  return { ...input, remaining: Math.max(0, input.allowance - input.used - input.reserved) };
}

export function emptyResearchAllowanceSnapshot(now = Date.now(), configuredAllowance = DEFAULT_RESEARCH_ALLOWANCE): ResearchAllowanceSnapshot {
  return snapshot({
    scope: DEFAULT_RESEARCH_SCOPE,
    periodStart: periodStart(now),
    allowance: allowanceValue(configuredAllowance),
    used: 0,
    reserved: 0,
    version: 0,
    updatedAt: now,
  });
}

export class InMemoryResearchAllowanceStore implements ResearchAllowanceStore {
  private readonly allowances = new Map<string, ResearchAllowanceSnapshot>();
  private readonly nonces = new Set<string>();
  private readonly bindings = new Map<string, AgentKitBindingRecord>();
  private readonly reservations = new Map<string, ResearchReservationRecord>();

  async verifyBinding(input: VerifyBindingInput): Promise<AgentKitBindingRecord> {
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || input.nonceExpiresAt <= now) throw new ResearchAllowanceExpiredError();
    const agentAddress = address(input.agentAddress);
    const nonceKey = `${agentAddress}:${identifier(input.domain, 'agent proof domain')}:${identifier(input.nonce, 'agent proof nonce')}`;
    if (this.nonces.has(nonceKey)) throw new ResearchAllowanceReplayError();
    const existing = this.bindings.get(agentAddress);
    const next = {
      agentAddress,
      humanKeyDigest: digest(input.humanKeyDigest),
      verifier: input.verifier,
      checkedAt: input.checkedAt,
      expiresAt: input.expiresAt,
      version: (existing?.version ?? 0) + 1,
      updatedAt: now,
    } satisfies AgentKitBindingRecord;
    this.nonces.add(nonceKey);
    this.bindings.set(agentAddress, next);
    return next;
  }

  async reserve(input: ReserveInput): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot; created: boolean }> {
    const now = input.now ?? Date.now();
    const agentAddress = address(input.agentAddress);
    const binding = this.bindings.get(agentAddress);
    if (!binding || binding.expiresAt <= now) throw new ResearchAllowanceExpiredError('verified agent binding is missing or expired');
    const normalizedScope = scope(input.scope);
    const configuredAllowance = allowanceValue(input.allowance);
    const start = periodStart(now);
    const requestId = identifier(input.requestId, 'research request id');
    const resourceId = identifier(input.resourceId, 'research resource id');
    const poolKey = `${binding.humanKeyDigest}:${normalizedScope}:${start}`;

    for (const [id, reservation] of this.reservations) {
      if (reservation.state === 'reserved' && reservation.leaseExpiresAt <= now) {
        this.reservations.set(id, { ...reservation, state: 'released', failureReason: 'reservation expired', updatedAt: now });
      }
    }
    const collision = this.reservations.get(requestId);
    if (collision && (collision.humanKeyDigest !== binding.humanKeyDigest || collision.scope !== normalizedScope || collision.resourceId !== resourceId)) {
      throw new ResearchAllowanceConflictError('research request id is already bound to another resource');
    }
    const existing = [...this.reservations.values()].find((reservation) =>
      reservation.humanKeyDigest === binding.humanKeyDigest && reservation.scope === normalizedScope && reservation.resourceId === resourceId,
    );
    if (existing?.state === 'delivered' || existing?.state === 'reserved') {
      return { reservation: existing, snapshot: this.snapshotFor(poolKey, normalizedScope, start, configuredAllowance, now), created: false };
    }

    const current = this.allowances.get(poolKey);
    if (current && current.allowance !== configuredAllowance) {
      throw new ResearchAllowanceConflictError('research allowance policy changed during a period');
    }
    const activeReserved = this.activeReservationCount(binding.humanKeyDigest, normalizedScope, start, now);
    if ((current?.used ?? 0) + activeReserved >= (current?.allowance ?? configuredAllowance)) throw new ResearchAllowanceExhaustedError();
    const id = existing?.id ?? requestId;
    const reservation: ResearchReservationRecord = {
      id,
      attemptToken: randomUUID(),
      humanKeyDigest: binding.humanKeyDigest,
      agentAddress,
      scope: normalizedScope,
      periodStart: start,
      resourceId,
      state: 'reserved',
      leaseExpiresAt: now + leaseValue(input.leaseMs),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.reservations.set(id, reservation);
    if (!current) {
      this.allowances.set(poolKey, snapshot({ scope: normalizedScope, periodStart: start, allowance: configuredAllowance, used: 0, reserved: 0, version: 1, updatedAt: now }));
    }
    return { reservation, snapshot: this.snapshotFor(poolKey, normalizedScope, start, configuredAllowance, now), created: true };
  }

  async commit(input: { reservationId: string; attemptToken: string; resultId: string; result?: unknown; now?: number }): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot }> {
    const now = input.now ?? Date.now();
    const reservation = this.reservations.get(identifier(input.reservationId, 'research reservation id'));
    if (!reservation) throw new ResearchAllowanceConflictError('research reservation was not found');
    const attemptToken = identifier(input.attemptToken, 'research reservation attempt token');
    if (reservation.attemptToken !== attemptToken) throw new ResearchAllowanceConflictError('research reservation attempt is stale');
    const resultId = identifier(input.resultId, 'research result id');
    const poolKey = `${reservation.humanKeyDigest}:${reservation.scope}:${reservation.periodStart}`;
    const current = this.allowances.get(poolKey);
    if (!current) throw new ResearchAllowanceConflictError('research allowance was not persisted');
    if (reservation.state === 'delivered') {
      if (reservation.resultId !== resultId) throw new ResearchAllowanceConflictError('research reservation already has another result');
      return { reservation, snapshot: this.snapshotFor(poolKey, reservation.scope, reservation.periodStart, current.allowance, now) };
    }
    if (reservation.state !== 'reserved') throw new ResearchAllowanceConflictError('research reservation is not active');
    if (current.used >= current.allowance) throw new ResearchAllowanceExhaustedError();
    const delivered: ResearchReservationRecord = { ...reservation, state: 'delivered', resultId, ...(input.result === undefined ? {} : { result: input.result }), deliveredAt: now, updatedAt: now };
    this.reservations.set(delivered.id, delivered);
    this.allowances.set(poolKey, snapshot({ ...current, used: current.used + 1, reserved: 0, version: current.version + 1, updatedAt: now }));
    return { reservation: delivered, snapshot: this.snapshotFor(poolKey, reservation.scope, reservation.periodStart, current.allowance, now) };
  }

  async release(input: { reservationId: string; attemptToken: string; reason: string; now?: number }): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot }> {
    const now = input.now ?? Date.now();
    const reservation = this.reservations.get(identifier(input.reservationId, 'research reservation id'));
    if (!reservation) throw new ResearchAllowanceConflictError('research reservation was not found');
    const attemptToken = identifier(input.attemptToken, 'research reservation attempt token');
    if (reservation.attemptToken !== attemptToken) throw new ResearchAllowanceConflictError('research reservation attempt is stale');
    const poolKey = `${reservation.humanKeyDigest}:${reservation.scope}:${reservation.periodStart}`;
    const current = this.allowances.get(poolKey);
    if (!current) throw new ResearchAllowanceConflictError('research allowance was not persisted');
    if (reservation.state === 'delivered') return { reservation, snapshot: this.snapshotFor(poolKey, reservation.scope, reservation.periodStart, current.allowance, now) };
    const released: ResearchReservationRecord = { ...reservation, state: 'released', failureReason: identifier(input.reason, 'research failure reason'), updatedAt: now };
    this.reservations.set(released.id, released);
    return { reservation: released, snapshot: this.snapshotFor(poolKey, reservation.scope, reservation.periodStart, current.allowance, now) };
  }

  async get(input: { humanKeyDigest: string; scope?: string; now?: number }): Promise<ResearchAllowanceSnapshot | null> {
    const now = input.now ?? Date.now();
    const humanKeyDigest = digest(input.humanKeyDigest);
    const normalizedScope = scope(input.scope);
    const start = periodStart(now);
    const poolKey = `${humanKeyDigest}:${normalizedScope}:${start}`;
    const current = this.allowances.get(poolKey);
    return current ? this.snapshotFor(poolKey, normalizedScope, start, current.allowance, now) : null;
  }

  async getDelivered(input: { agentAddress: string; resourceId: string; scope?: string }): Promise<ResearchReservationRecord | null> {
    const binding = this.bindings.get(address(input.agentAddress));
    if (!binding) return null;
    const normalizedScope = scope(input.scope);
    const resourceId = identifier(input.resourceId, 'research resource id');
    return [...this.reservations.values()].find((reservation) =>
      reservation.humanKeyDigest === binding.humanKeyDigest && reservation.scope === normalizedScope && reservation.resourceId === resourceId && reservation.state === 'delivered',
    ) ?? null;
  }

  async getBinding(agentAddress: string): Promise<AgentKitBindingRecord | null> {
    return this.bindings.get(address(agentAddress)) ?? null;
  }

  async listBindings(humanKeyDigest: string): Promise<readonly AgentKitBindingRecord[]> {
    const key = digest(humanKeyDigest);
    return [...this.bindings.values()].filter((binding) => binding.humanKeyDigest === key);
  }

  private activeReservationCount(humanKeyDigest: string, normalizedScope: string, start: number, now: number): number {
    return [...this.reservations.values()].filter((reservation) =>
      reservation.humanKeyDigest === humanKeyDigest && reservation.scope === normalizedScope && reservation.periodStart === start && reservation.state === 'reserved' && reservation.leaseExpiresAt > now,
    ).length;
  }

  private snapshotFor(poolKey: string, normalizedScope: string, start: number, configuredAllowance: number, now: number): ResearchAllowanceSnapshot {
    const current = this.allowances.get(poolKey);
    return snapshot({
      scope: normalizedScope,
      periodStart: start,
      allowance: current?.allowance ?? configuredAllowance,
      used: current?.used ?? 0,
      reserved: this.activeReservationCount(poolKey.split(':')[0]!, normalizedScope, start, now),
      version: current?.version ?? 0,
      updatedAt: current?.updatedAt ?? now,
    });
  }
}

interface AllowanceRow extends Record<string, unknown> {
  human_key_digest: string;
  scope: string;
  period_start: string | number;
  allowance: string | number;
  used: string | number;
  version: string | number;
  updated_at: string | number;
}

interface BindingRow extends Record<string, unknown> {
  agent_address: string;
  human_key_digest: string;
  verifier: 'world-agentbook';
  checked_at: string | number;
  expires_at: string | number;
  version: string | number;
  updated_at: string | number;
}

interface ReservationRow extends Record<string, unknown> {
  id: string;
  attempt_token: string;
  human_key_digest: string;
  agent_address: string;
  scope: string;
  period_start: string | number;
  resource_id: string;
  state: ResearchReservationState;
  lease_expires_at: string | number;
  result_id: string | null;
  result: unknown | null;
  failure_reason: string | null;
  created_at: string | number;
  updated_at: string | number;
  delivered_at: string | number | null;
}

function integer(value: string | number, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new ResearchAllowanceConflictError(`invalid ${label}`);
  return parsed;
}

function rowBinding(row: BindingRow): AgentKitBindingRecord {
  return { agentAddress: row.agent_address, humanKeyDigest: row.human_key_digest, verifier: row.verifier, checkedAt: integer(row.checked_at, 'binding checked_at'), expiresAt: integer(row.expires_at, 'binding expires_at'), version: integer(row.version, 'binding version'), updatedAt: integer(row.updated_at, 'binding updated_at') };
}

function rowReservation(row: ReservationRow): ResearchReservationRecord {
  return {
    id: row.id,
    attemptToken: row.attempt_token,
    humanKeyDigest: row.human_key_digest,
    agentAddress: row.agent_address,
    scope: row.scope,
    periodStart: integer(row.period_start, 'reservation period'),
    resourceId: row.resource_id,
    state: row.state,
    leaseExpiresAt: integer(row.lease_expires_at, 'reservation lease'),
    ...(row.result_id ? { resultId: row.result_id } : {}),
    ...(row.result == null ? {} : { result: row.result }),
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
    createdAt: integer(row.created_at, 'reservation created_at'),
    updatedAt: integer(row.updated_at, 'reservation updated_at'),
    ...(row.delivered_at == null ? {} : { deliveredAt: integer(row.delivered_at, 'reservation delivered_at') }),
  };
}

async function postgresSnapshot(executor: SqlExecutor, row: AllowanceRow, now: number): Promise<ResearchAllowanceSnapshot> {
  const reserved = await executor.query<{ count: string | number }>(
    `SELECT COUNT(*) AS count FROM agentkit_research_reservations_v1
      WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3
        AND state = 'reserved' AND lease_expires_at > $4`,
    [row.human_key_digest, row.scope, row.period_start, now],
  );
  return snapshot({ scope: row.scope, periodStart: integer(row.period_start, 'allowance period'), allowance: integer(row.allowance, 'allowance'), used: integer(row.used, 'allowance used'), reserved: integer(reserved.rows[0]?.count ?? 0, 'allowance reserved'), version: integer(row.version, 'allowance version'), updatedAt: integer(row.updated_at, 'allowance updated_at') });
}


export class PostgresResearchAllowanceStore implements ResearchAllowanceStore {
  constructor(private readonly executor: SqlExecutor, private readonly transaction: TransactionRunner) {}

  async verifyBinding(input: VerifyBindingInput): Promise<AgentKitBindingRecord> {
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || input.nonceExpiresAt <= now) throw new ResearchAllowanceExpiredError();
    const agentAddress = address(input.agentAddress);
    return this.transaction(async (tx) => {
      const nonce = await tx.query(`INSERT INTO agentkit_used_nonces_v1
        (signer,domain,nonce,human_key_digest,expires_at,consumed_at)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (signer,domain,nonce) DO NOTHING RETURNING signer`,
        [agentAddress, identifier(input.domain, 'agent proof domain'), identifier(input.nonce, 'agent proof nonce'), digest(input.humanKeyDigest), input.nonceExpiresAt, now]);
      if (nonce.rows.length === 0) throw new ResearchAllowanceReplayError();
      const row = (await tx.query<BindingRow>(`INSERT INTO agentkit_bindings_v1
        (agent_address,human_key_digest,verifier,checked_at,expires_at,version,updated_at)
        VALUES ($1,$2,$3,$4,$5,1,$6)
        ON CONFLICT (agent_address) DO UPDATE SET human_key_digest = EXCLUDED.human_key_digest,
          verifier = EXCLUDED.verifier, checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at,
          version = agentkit_bindings_v1.version + 1, updated_at = EXCLUDED.updated_at RETURNING *`,
        [agentAddress, digest(input.humanKeyDigest), input.verifier, input.checkedAt, input.expiresAt, now])).rows[0];
      if (!row) throw new ResearchAllowanceConflictError('agent binding was not persisted');
      return rowBinding(row);
    });
  }

  async reserve(input: ReserveInput): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot; created: boolean }> {
    const now = input.now ?? Date.now();
    const agentAddress = address(input.agentAddress);
    const normalizedScope = scope(input.scope);
    const configuredAllowance = allowanceValue(input.allowance);
    const start = periodStart(now);
    const requestId = identifier(input.requestId, 'research request id');
    const resourceId = identifier(input.resourceId, 'research resource id');
    return this.transaction(async (tx) => {
      const bindingRow = (await tx.query<BindingRow>('SELECT * FROM agentkit_bindings_v1 WHERE agent_address = $1 FOR SHARE', [agentAddress])).rows[0];
      if (!bindingRow || integer(bindingRow.expires_at, 'binding expires_at') <= now) throw new ResearchAllowanceExpiredError('verified agent binding is missing or expired');
      const binding = rowBinding(bindingRow);
      await tx.query(`INSERT INTO agentkit_research_allowances_v1
        (human_key_digest,scope,period_start,allowance,used,version,updated_at)
        VALUES ($1,$2,$3,$4,0,1,$5) ON CONFLICT DO NOTHING`,
        [binding.humanKeyDigest, normalizedScope, start, configuredAllowance, now]);
      const allowanceRow = (await tx.query<AllowanceRow>(`SELECT * FROM agentkit_research_allowances_v1
        WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3 FOR UPDATE`,
        [binding.humanKeyDigest, normalizedScope, start])).rows[0];
      if (!allowanceRow) throw new ResearchAllowanceConflictError('research allowance was not persisted');
      if (integer(allowanceRow.allowance, 'allowance') !== configuredAllowance) throw new ResearchAllowanceConflictError('research allowance policy changed during a period');
      await tx.query(`UPDATE agentkit_research_reservations_v1 SET state = 'released',
        failure_reason = 'reservation expired', updated_at = $3
        WHERE human_key_digest = $1 AND scope = $2
          AND state = 'reserved' AND lease_expires_at <= $3`,
        [binding.humanKeyDigest, normalizedScope, now]);
      const conflicts = await tx.query<ReservationRow>(`SELECT * FROM agentkit_research_reservations_v1
        WHERE id = $1 OR (human_key_digest = $2 AND scope = $3 AND resource_id = $4)
        ORDER BY created_at ASC FOR UPDATE`, [requestId, binding.humanKeyDigest, normalizedScope, resourceId]);
      const requestCollision = conflicts.rows.find((row) => row.id === requestId && (row.human_key_digest !== binding.humanKeyDigest || row.scope !== normalizedScope || row.resource_id !== resourceId));
      if (requestCollision) throw new ResearchAllowanceConflictError('research request id is already bound to another resource');
      const existingRow = conflicts.rows.find((row) => row.human_key_digest === binding.humanKeyDigest && row.scope === normalizedScope && row.resource_id === resourceId);
      if (existingRow && (existingRow.state === 'reserved' || existingRow.state === 'delivered')) {
        return { reservation: rowReservation(existingRow), snapshot: await postgresSnapshot(tx, allowanceRow, now), created: false };
      }
      const current = await postgresSnapshot(tx, allowanceRow, now);
      if (current.used + current.reserved >= current.allowance) throw new ResearchAllowanceExhaustedError();
      const id = existingRow?.id ?? requestId;
      const attemptToken = randomUUID();
      const row = (await tx.query<ReservationRow>(`INSERT INTO agentkit_research_reservations_v1
        (id,attempt_token,human_key_digest,agent_address,scope,period_start,resource_id,state,lease_expires_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8,$9,$9)
        ON CONFLICT (id) DO UPDATE SET agent_address = EXCLUDED.agent_address,
          period_start = EXCLUDED.period_start, state = 'reserved',
          lease_expires_at = EXCLUDED.lease_expires_at, result_id = NULL, failure_reason = NULL,
          attempt_token = EXCLUDED.attempt_token, delivered_at = NULL, updated_at = EXCLUDED.updated_at RETURNING *`,
        [id, attemptToken, binding.humanKeyDigest, agentAddress, normalizedScope, start, resourceId, now + leaseValue(input.leaseMs), now])).rows[0];
      if (!row) throw new ResearchAllowanceConflictError('research reservation was not persisted');
      return { reservation: rowReservation(row), snapshot: await postgresSnapshot(tx, allowanceRow, now), created: true };
    });
  }

  async commit(input: { reservationId: string; attemptToken: string; resultId: string; result?: unknown; now?: number }): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot }> {
    const now = input.now ?? Date.now();
    return this.transaction(async (tx) => {
      const row = (await tx.query<ReservationRow>('SELECT * FROM agentkit_research_reservations_v1 WHERE id = $1 FOR UPDATE', [identifier(input.reservationId, 'research reservation id')])).rows[0];
      if (!row) throw new ResearchAllowanceConflictError('research reservation was not found');
      const reservation = rowReservation(row);
      const attemptToken = identifier(input.attemptToken, 'research reservation attempt token');
      if (reservation.attemptToken !== attemptToken) throw new ResearchAllowanceConflictError('research reservation attempt is stale');
      const allowanceRow = (await tx.query<AllowanceRow>(`SELECT * FROM agentkit_research_allowances_v1
        WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3 FOR UPDATE`,
        [reservation.humanKeyDigest, reservation.scope, reservation.periodStart])).rows[0];
      if (!allowanceRow) throw new ResearchAllowanceConflictError('research allowance was not persisted');
      const resultId = identifier(input.resultId, 'research result id');
      if (reservation.state === 'delivered') {
        if (reservation.resultId !== resultId) throw new ResearchAllowanceConflictError('research reservation already has another result');
        return { reservation, snapshot: await postgresSnapshot(tx, allowanceRow, now) };
      }
      if (reservation.state !== 'reserved') throw new ResearchAllowanceConflictError('research reservation is not active');
      const updatedAllowance = (await tx.query<AllowanceRow>(`UPDATE agentkit_research_allowances_v1
        SET used = used + 1, version = version + 1, updated_at = $4
        WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3 AND used < allowance RETURNING *`,
        [reservation.humanKeyDigest, reservation.scope, reservation.periodStart, now])).rows[0];
      if (!updatedAllowance) throw new ResearchAllowanceExhaustedError();
      const delivered = (await tx.query<ReservationRow>(`UPDATE agentkit_research_reservations_v1
        SET state = 'delivered', result_id = $3, result = $4::jsonb, delivered_at = $5, updated_at = $5
        WHERE id = $1 AND attempt_token = $2 RETURNING *`, [reservation.id, attemptToken, resultId, JSON.stringify(input.result ?? null), now])).rows[0];
      if (!delivered) throw new ResearchAllowanceConflictError('research delivery was not persisted');
      return { reservation: rowReservation(delivered), snapshot: await postgresSnapshot(tx, updatedAllowance, now) };
    });
  }

  async release(input: { reservationId: string; attemptToken: string; reason: string; now?: number }): Promise<{ reservation: ResearchReservationRecord; snapshot: ResearchAllowanceSnapshot }> {
    const now = input.now ?? Date.now();
    return this.transaction(async (tx) => {
      const row = (await tx.query<ReservationRow>('SELECT * FROM agentkit_research_reservations_v1 WHERE id = $1 FOR UPDATE', [identifier(input.reservationId, 'research reservation id')])).rows[0];
      if (!row) throw new ResearchAllowanceConflictError('research reservation was not found');
      const reservation = rowReservation(row);
      const attemptToken = identifier(input.attemptToken, 'research reservation attempt token');
      if (reservation.attemptToken !== attemptToken) throw new ResearchAllowanceConflictError('research reservation attempt is stale');
      const allowanceRow = (await tx.query<AllowanceRow>(`SELECT * FROM agentkit_research_allowances_v1
        WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3 FOR UPDATE`, [reservation.humanKeyDigest, reservation.scope, reservation.periodStart])).rows[0];
      if (!allowanceRow) throw new ResearchAllowanceConflictError('research allowance was not persisted');
      if (reservation.state === 'delivered') return { reservation, snapshot: await postgresSnapshot(tx, allowanceRow, now) };
      const released = (await tx.query<ReservationRow>(`UPDATE agentkit_research_reservations_v1
        SET state = 'released', failure_reason = $3, updated_at = $4 WHERE id = $1 AND attempt_token = $2 RETURNING *`,
        [reservation.id, attemptToken, identifier(input.reason, 'research failure reason'), now])).rows[0];
      if (!released) throw new ResearchAllowanceConflictError('research release was not persisted');
      return { reservation: rowReservation(released), snapshot: await postgresSnapshot(tx, allowanceRow, now) };
    });
  }

  async get(input: { humanKeyDigest: string; scope?: string; now?: number }): Promise<ResearchAllowanceSnapshot | null> {
    const now = input.now ?? Date.now();
    const row = (await this.executor.query<AllowanceRow>(`SELECT * FROM agentkit_research_allowances_v1
      WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3`, [digest(input.humanKeyDigest), scope(input.scope), periodStart(now)])).rows[0];
    return row ? postgresSnapshot(this.executor, row, now) : null;
  }

  async getDelivered(input: { agentAddress: string; resourceId: string; scope?: string }): Promise<ResearchReservationRecord | null> {
    const binding = await this.getBinding(input.agentAddress);
    if (!binding) return null;
    const row = (await this.executor.query<ReservationRow>(`SELECT * FROM agentkit_research_reservations_v1
      WHERE human_key_digest = $1 AND scope = $2 AND resource_id = $3 AND state = 'delivered'`,
      [binding.humanKeyDigest, scope(input.scope), identifier(input.resourceId, 'research resource id')])).rows[0];
    return row ? rowReservation(row) : null;
  }

  async getBinding(agentAddress: string): Promise<AgentKitBindingRecord | null> {
    const row = (await this.executor.query<BindingRow>('SELECT * FROM agentkit_bindings_v1 WHERE agent_address = $1', [address(agentAddress)])).rows[0];
    return row ? rowBinding(row) : null;
  }

  async listBindings(humanKeyDigest: string): Promise<readonly AgentKitBindingRecord[]> {
    const rows = await this.executor.query<BindingRow>('SELECT * FROM agentkit_bindings_v1 WHERE human_key_digest = $1 ORDER BY agent_address ASC', [digest(humanKeyDigest)]);
    return rows.rows.map(rowBinding);
  }
}
