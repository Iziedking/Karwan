import type { SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';

export const DEFAULT_RESEARCH_ALLOWANCE = 3;
export const DEFAULT_RESEARCH_SCOPE = 'counterparty-report';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResearchAllowanceSnapshot {
  scope: string;
  periodStart: number;
  allowance: number;
  used: number;
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

export interface ResearchAllowanceStore {
  consume(input: {
    humanKeyDigest: string;
    agentAddress: string;
    domain: string;
    nonce: string;
    scope?: string;
    allowance?: number;
    nonceExpiresAt: number;
    now?: number;
  }): Promise<{ snapshot: ResearchAllowanceSnapshot; created: boolean }>;
  get(input: { humanKeyDigest: string; scope?: string; now?: number }): Promise<ResearchAllowanceSnapshot | null>;
  recordBinding(input: Omit<AgentKitBindingRecord, 'version' | 'updatedAt'> & { now?: number }): Promise<AgentKitBindingRecord>;
  listBindings(humanKeyDigest: string): Promise<readonly AgentKitBindingRecord[]>;
}

export class ResearchAllowanceReplayError extends Error {
  constructor() {
    super('agent proof nonce has already been consumed');
    this.name = 'ResearchAllowanceReplayError';
  }
}

export class ResearchAllowanceExpiredError extends Error {
  constructor() {
    super('agent proof nonce has expired');
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

function snapshot(input: {
  scope: string;
  periodStart: number;
  allowance: number;
  used: number;
  version: number;
  updatedAt: number;
}): ResearchAllowanceSnapshot {
  return { ...input, remaining: Math.max(0, input.allowance - input.used) };
}

export class InMemoryResearchAllowanceStore implements ResearchAllowanceStore {
  private readonly allowances = new Map<string, ResearchAllowanceSnapshot>();
  private readonly nonces = new Set<string>();
  private readonly bindings = new Map<string, AgentKitBindingRecord>();

  async consume(input: {
    humanKeyDigest: string;
    agentAddress: string;
    domain: string;
    nonce: string;
    scope?: string;
    allowance?: number;
    nonceExpiresAt: number;
    now?: number;
  }): Promise<{ snapshot: ResearchAllowanceSnapshot; created: boolean }> {
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || input.nonceExpiresAt <= now) throw new ResearchAllowanceExpiredError();
    const humanKeyDigest = digest(input.humanKeyDigest);
    const agentAddress = address(input.agentAddress);
    const normalizedScope = scope(input.scope);
    const configuredAllowance = allowanceValue(input.allowance);
    const nonceKey = `${agentAddress}:${input.domain}:${input.nonce}`;
    if (this.nonces.has(nonceKey)) throw new ResearchAllowanceReplayError();
    const key = `${humanKeyDigest}:${normalizedScope}:${periodStart(now)}`;
    const current = this.allowances.get(key);
    if (current && current.used >= current.allowance) throw new ResearchAllowanceExhaustedError();
    if (current && current.allowance !== configuredAllowance) {
      throw new ResearchAllowanceConflictError('research allowance policy changed during a period');
    }
    const next = snapshot({
      scope: normalizedScope,
      periodStart: current?.periodStart ?? periodStart(now),
      allowance: current?.allowance ?? configuredAllowance,
      used: (current?.used ?? 0) + 1,
      version: (current?.version ?? 0) + 1,
      updatedAt: now,
    });
    this.nonces.add(nonceKey);
    this.allowances.set(key, next);
    return { snapshot: next, created: !current };
  }

  async get(input: { humanKeyDigest: string; scope?: string; now?: number }): Promise<ResearchAllowanceSnapshot | null> {
    const now = input.now ?? Date.now();
    return this.allowances.get(`${digest(input.humanKeyDigest)}:${scope(input.scope)}:${periodStart(now)}`) ?? null;
  }

  async recordBinding(input: Omit<AgentKitBindingRecord, 'version' | 'updatedAt'> & { now?: number }): Promise<AgentKitBindingRecord> {
    const agentAddress = address(input.agentAddress);
    const existing = this.bindings.get(agentAddress);
    const next = {
      agentAddress,
      humanKeyDigest: digest(input.humanKeyDigest),
      verifier: input.verifier,
      checkedAt: input.checkedAt,
      expiresAt: input.expiresAt,
      version: (existing?.version ?? 0) + 1,
      updatedAt: input.now ?? Date.now(),
    } satisfies AgentKitBindingRecord;
    this.bindings.set(agentAddress, next);
    return next;
  }

  async listBindings(humanKeyDigest: string): Promise<readonly AgentKitBindingRecord[]> {
    const key = digest(humanKeyDigest);
    return [...this.bindings.values()].filter((binding) => binding.humanKeyDigest === key);
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

function integer(value: string | number, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new ResearchAllowanceConflictError(`invalid ${label}`);
  return parsed;
}

function rowSnapshot(row: AllowanceRow): ResearchAllowanceSnapshot {
  return snapshot({
    scope: row.scope,
    periodStart: integer(row.period_start, 'allowance period'),
    allowance: integer(row.allowance, 'allowance'),
    used: integer(row.used, 'allowance used'),
    version: integer(row.version, 'allowance version'),
    updatedAt: integer(row.updated_at, 'allowance updated_at'),
  });
}

function rowBinding(row: BindingRow): AgentKitBindingRecord {
  return {
    agentAddress: row.agent_address,
    humanKeyDigest: row.human_key_digest,
    verifier: row.verifier,
    checkedAt: integer(row.checked_at, 'binding checked_at'),
    expiresAt: integer(row.expires_at, 'binding expires_at'),
    version: integer(row.version, 'binding version'),
    updatedAt: integer(row.updated_at, 'binding updated_at'),
  };
}

export class PostgresResearchAllowanceStore implements ResearchAllowanceStore {
  constructor(private readonly executor: SqlExecutor, private readonly transaction: TransactionRunner) {}

  async consume(input: {
    humanKeyDigest: string;
    agentAddress: string;
    domain: string;
    nonce: string;
    scope?: string;
    allowance?: number;
    nonceExpiresAt: number;
    now?: number;
  }): Promise<{ snapshot: ResearchAllowanceSnapshot; created: boolean }> {
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || input.nonceExpiresAt <= now) throw new ResearchAllowanceExpiredError();
    const humanKeyDigest = digest(input.humanKeyDigest);
    const agentAddress = address(input.agentAddress);
    const normalizedScope = scope(input.scope);
    const configuredAllowance = allowanceValue(input.allowance);
    const start = periodStart(now);
    return this.transaction(async (tx) => {
      const nonce = await tx.query<{ inserted: boolean }>(
        `INSERT INTO agentkit_used_nonces_v1
          (signer,domain,nonce,human_key_digest,expires_at,consumed_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (signer,domain,nonce) DO NOTHING
         RETURNING TRUE AS inserted`,
        [agentAddress, input.domain, input.nonce, humanKeyDigest, input.nonceExpiresAt, now],
      );
      if (nonce.rows.length === 0) throw new ResearchAllowanceReplayError();
      const upserted = (await tx.query<AllowanceRow>(
        `INSERT INTO agentkit_research_allowances_v1
          (human_key_digest,scope,period_start,allowance,used,version,updated_at)
         VALUES ($1,$2,$3,$4,1,1,$5)
         ON CONFLICT (human_key_digest,scope,period_start) DO UPDATE SET
           used = agentkit_research_allowances_v1.used + 1,
           version = agentkit_research_allowances_v1.version + 1,
           updated_at = EXCLUDED.updated_at
         WHERE agentkit_research_allowances_v1.allowance = EXCLUDED.allowance
           AND agentkit_research_allowances_v1.used < agentkit_research_allowances_v1.allowance
         RETURNING *`,
        [humanKeyDigest, normalizedScope, start, configuredAllowance, now],
      )).rows[0];
      if (upserted) return { snapshot: rowSnapshot(upserted), created: integer(upserted.version, 'allowance version') === 1 };
      const current = (await tx.query<AllowanceRow>(
        `SELECT * FROM agentkit_research_allowances_v1
          WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3`,
        [humanKeyDigest, normalizedScope, start],
      )).rows[0];
      if (!current) throw new ResearchAllowanceConflictError('allowance was not persisted');
      const existing = rowSnapshot(current);
      if (existing.allowance !== configuredAllowance) throw new ResearchAllowanceConflictError('research allowance policy changed during a period');
      throw new ResearchAllowanceExhaustedError();
    });
  }

  async get(input: { humanKeyDigest: string; scope?: string; now?: number }): Promise<ResearchAllowanceSnapshot | null> {
    const now = input.now ?? Date.now();
    const row = (await this.executor.query<AllowanceRow>(
      `SELECT * FROM agentkit_research_allowances_v1 WHERE human_key_digest = $1 AND scope = $2 AND period_start = $3`,
      [digest(input.humanKeyDigest), scope(input.scope), periodStart(now)],
    )).rows[0];
    return row ? rowSnapshot(row) : null;
  }

  async recordBinding(input: Omit<AgentKitBindingRecord, 'version' | 'updatedAt'> & { now?: number }): Promise<AgentKitBindingRecord> {
    const now = input.now ?? Date.now();
    const row = (await this.transaction(async (tx) => tx.query<BindingRow>(
      `INSERT INTO agentkit_bindings_v1
        (agent_address,human_key_digest,verifier,checked_at,expires_at,version,updated_at)
       VALUES ($1,$2,$3,$4,$5,1,$6)
       ON CONFLICT (agent_address) DO UPDATE SET
         human_key_digest = EXCLUDED.human_key_digest,
         verifier = EXCLUDED.verifier,
         checked_at = EXCLUDED.checked_at,
         expires_at = EXCLUDED.expires_at,
         version = agentkit_bindings_v1.version + 1,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [address(input.agentAddress), digest(input.humanKeyDigest), input.verifier, input.checkedAt, input.expiresAt, now],
    ))).rows[0];
    if (!row) throw new ResearchAllowanceConflictError('agent binding was not persisted');
    return rowBinding(row);
  }

  async listBindings(humanKeyDigest: string): Promise<readonly AgentKitBindingRecord[]> {
    const rows = await this.executor.query<BindingRow>(
      `SELECT * FROM agentkit_bindings_v1 WHERE human_key_digest = $1 ORDER BY agent_address ASC`,
      [digest(humanKeyDigest)],
    );
    return rows.rows.map(rowBinding);
  }
}
