import type { RuntimeData } from '../db/agentRuntime.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';

export type EvidenceNeedState = 'open' | 'fulfilled' | 'expired' | 'cancelled';
export type EvidencePurchaseState = 'created' | 'submitted' | 'unknown' | 'reconciling' | 'settled' | 'failed';
export type EvidenceSnapshotState = 'fresh' | 'stale' | 'unknown' | 'contradictory';
export type QualificationBlockerState = 'open' | 'resolved' | 'cancelled' | 'expired';

export interface EvidenceNeedRecord {
  id: string;
  dealRoomId: string;
  needKey: string;
  kind: string;
  state: EvidenceNeedState;
  riskClass: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  data: RuntimeData;
}

export interface EvidencePurchaseRecord {
  id: string;
  evidenceNeedId: string;
  idempotencyKey: string;
  providerId: string;
  state: EvidencePurchaseState;
  priceUsdc: string;
  providerTransactionId?: string;
  txHash?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  data: RuntimeData;
}

export interface EvidenceSnapshotRecord {
  id: string;
  evidenceNeedId: string;
  purchaseId?: string;
  source: string;
  capturedAt: number;
  reliability: number;
  state: EvidenceSnapshotState;
  responseHash: string;
  provenance: readonly string[];
  createdAt: number;
}

export interface QualificationBlockerRecord {
  id: string;
  dealRoomId: string;
  blockerKey: string;
  kind: string;
  state: QualificationBlockerState;
  subject: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  data: RuntimeData;
}

export class EvidenceRuntimeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceRuntimeConflictError';
  }
}

export class EvidenceRuntimeDuplicateError extends Error {
  constructor(boundary: string) {
    super(`duplicate evidence runtime boundary: ${boundary}`);
    this.name = 'EvidenceRuntimeDuplicateError';
  }
}

export interface EvidenceRuntimeRepository {
  createNeed(input: Omit<EvidenceNeedRecord, 'version' | 'createdAt' | 'updatedAt' | 'state'> & { now?: number }): Promise<{ record: EvidenceNeedRecord; created: boolean }>;
  getNeed(id: string): Promise<EvidenceNeedRecord | null>;
  updateNeed(id: string, expectedVersion: number, state: EvidenceNeedState, data?: RuntimeData, now?: number): Promise<EvidenceNeedRecord>;
  createPurchase(input: Omit<EvidencePurchaseRecord, 'version' | 'createdAt' | 'updatedAt' | 'state'> & { now?: number }): Promise<{ record: EvidencePurchaseRecord; created: boolean }>;
  getPurchase(id: string): Promise<EvidencePurchaseRecord | null>;
  getPurchaseByIdempotencyKey(key: string): Promise<EvidencePurchaseRecord | null>;
  listPurchasesByState(states: readonly EvidencePurchaseState[], limit?: number): Promise<readonly EvidencePurchaseRecord[]>;
  updatePurchase(id: string, expectedVersion: number, state: EvidencePurchaseState, patch?: Partial<Pick<EvidencePurchaseRecord, 'providerTransactionId' | 'txHash' | 'data'>> & { now?: number }): Promise<EvidencePurchaseRecord>;
  recordSnapshot(input: Omit<EvidenceSnapshotRecord, 'createdAt'> & { now?: number }): Promise<{ record: EvidenceSnapshotRecord; created: boolean }>;
  listSnapshots(evidenceNeedId: string): Promise<readonly EvidenceSnapshotRecord[]>;
  createBlocker(input: Omit<QualificationBlockerRecord, 'version' | 'createdAt' | 'updatedAt' | 'state' | 'resolvedAt'> & { now?: number }): Promise<{ record: QualificationBlockerRecord; created: boolean }>;
  getBlocker(id: string): Promise<QualificationBlockerRecord | null>;
  getBlockerByKey(key: string): Promise<QualificationBlockerRecord | null>;
  listOpenBlockersForSubject(subject: string, limit?: number): Promise<readonly QualificationBlockerRecord[]>;
  resolveBlocker(id: string, expectedVersion: number, state: Extract<QualificationBlockerState, 'resolved' | 'cancelled' | 'expired'>, data?: RuntimeData, now?: number): Promise<QualificationBlockerRecord>;
}

const purchaseTransitions: Record<EvidencePurchaseState, readonly EvidencePurchaseState[]> = {
  created: ['submitted', 'unknown', 'failed'],
  submitted: ['unknown', 'reconciling', 'settled', 'failed'],
  unknown: ['reconciling', 'settled', 'failed'],
  reconciling: ['unknown', 'settled', 'failed'],
  settled: [],
  failed: [],
};

function nextPurchaseState(current: EvidencePurchaseState, next: EvidencePurchaseState): void {
  if (current === next) return;
  if (!purchaseTransitions[current].includes(next)) {
    throw new EvidenceRuntimeConflictError(`invalid evidence purchase transition ${current}->${next}`);
  }
}

function assertSettledPurchase(current: EvidencePurchaseRecord, next: EvidencePurchaseState, txHash?: string): void {
  if (next === 'settled' && !(txHash ?? current.txHash)) {
    throw new EvidenceRuntimeConflictError('SETTLED_REQUIRES_TX_HASH');
  }
}

function mergeData(current: RuntimeData, patch?: RuntimeData): RuntimeData {
  return patch ? { ...current, ...patch } : current;
}

function sameNeedIdentity(current: EvidenceNeedRecord, input: Omit<EvidenceNeedRecord, 'version' | 'createdAt' | 'updatedAt' | 'state'>): boolean {
  return current.dealRoomId === input.dealRoomId && current.kind === input.kind && current.riskClass === input.riskClass;
}

function sameBlockerIdentity(current: QualificationBlockerRecord, input: Omit<QualificationBlockerRecord, 'version' | 'createdAt' | 'updatedAt' | 'state' | 'resolvedAt'>): boolean {
  return current.dealRoomId === input.dealRoomId && current.kind === input.kind && current.subject === input.subject;
}

export class InMemoryEvidenceRuntimeRepository implements EvidenceRuntimeRepository {
  private readonly needs = new Map<string, EvidenceNeedRecord>();
  private readonly needsByKey = new Map<string, string>();
  private readonly purchases = new Map<string, EvidencePurchaseRecord>();
  private readonly purchasesByKey = new Map<string, string>();
  private readonly snapshots = new Map<string, EvidenceSnapshotRecord>();
  private readonly snapshotByNeedHash = new Map<string, string>();
  private readonly blockers = new Map<string, QualificationBlockerRecord>();
  private readonly blockersByKey = new Map<string, string>();

  async createNeed(input: Omit<EvidenceNeedRecord, 'version' | 'createdAt' | 'updatedAt' | 'state'> & { now?: number }): Promise<{ record: EvidenceNeedRecord; created: boolean }> {
    const existingId = this.needsByKey.get(input.needKey);
    if (existingId) {
      const existing = this.needs.get(existingId)!;
      if (!sameNeedIdentity(existing, input)) throw new EvidenceRuntimeDuplicateError(`evidence_need.key:${input.needKey}`);
      return { record: existing, created: false };
    }
    if (this.needs.has(input.id)) throw new EvidenceRuntimeDuplicateError(`evidence_need.id:${input.id}`);
    const now = input.now ?? Date.now();
    const record: EvidenceNeedRecord = { ...input, state: 'open', version: 1, createdAt: now, updatedAt: now };
    this.needs.set(record.id, record);
    this.needsByKey.set(record.needKey, record.id);
    return { record, created: true };
  }

  async getNeed(id: string): Promise<EvidenceNeedRecord | null> { return this.needs.get(id) ?? null; }

  async updateNeed(id: string, expectedVersion: number, state: EvidenceNeedState, data?: RuntimeData, now = Date.now()): Promise<EvidenceNeedRecord> {
    const current = this.needs.get(id);
    if (!current || current.version !== expectedVersion) throw new EvidenceRuntimeConflictError(`evidence need ${id} version ${expectedVersion} is stale`);
    if (current.state !== state && (current.state !== 'open' || state === 'open')) throw new EvidenceRuntimeConflictError(`invalid evidence need transition ${current.state}->${state}`);
    const next = { ...current, state, data: mergeData(current.data, data), version: current.version + 1, updatedAt: now };
    this.needs.set(id, next);
    return next;
  }

  async createPurchase(input: Omit<EvidencePurchaseRecord, 'version' | 'createdAt' | 'updatedAt' | 'state'> & { now?: number }): Promise<{ record: EvidencePurchaseRecord; created: boolean }> {
    const existingId = this.purchasesByKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.purchases.get(existingId)!;
      if (existing.evidenceNeedId !== input.evidenceNeedId || existing.providerId !== input.providerId || existing.priceUsdc !== input.priceUsdc) throw new EvidenceRuntimeDuplicateError(`evidence_purchase.key:${input.idempotencyKey}`);
      return { record: existing, created: false };
    }
    if (this.purchases.has(input.id)) throw new EvidenceRuntimeDuplicateError(`evidence_purchase.id:${input.id}`);
    if (!this.needs.has(input.evidenceNeedId)) throw new EvidenceRuntimeConflictError(`unknown evidence need ${input.evidenceNeedId}`);
    const now = input.now ?? Date.now();
    const record: EvidencePurchaseRecord = { ...input, state: 'created', version: 1, createdAt: now, updatedAt: now };
    this.purchases.set(record.id, record);
    this.purchasesByKey.set(record.idempotencyKey, record.id);
    return { record, created: true };
  }

  async getPurchase(id: string): Promise<EvidencePurchaseRecord | null> { return this.purchases.get(id) ?? null; }
  async getPurchaseByIdempotencyKey(key: string): Promise<EvidencePurchaseRecord | null> { const id = this.purchasesByKey.get(key); return id ? this.purchases.get(id) ?? null : null; }
  async listPurchasesByState(states: readonly EvidencePurchaseState[], limit = 100): Promise<readonly EvidencePurchaseRecord[]> {
    const allowed = new Set(states);
    return [...this.purchases.values()]
      .filter((purchase) => allowed.has(purchase.state))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, Math.max(1, Math.min(500, Math.floor(limit))))
      .map((purchase) => structuredClone(purchase));
  }

  async updatePurchase(id: string, expectedVersion: number, state: EvidencePurchaseState, patch: Partial<Pick<EvidencePurchaseRecord, 'providerTransactionId' | 'txHash' | 'data'>> & { now?: number } = {}): Promise<EvidencePurchaseRecord> {
    const current = this.purchases.get(id);
    if (!current || current.version !== expectedVersion) throw new EvidenceRuntimeConflictError(`evidence purchase ${id} version ${expectedVersion} is stale`);
    nextPurchaseState(current.state, state);
    assertSettledPurchase(current, state, patch.txHash);
    const next: EvidencePurchaseRecord = {
      ...current,
      state,
      ...(patch.providerTransactionId === undefined ? {} : { providerTransactionId: patch.providerTransactionId }),
      ...(patch.txHash === undefined ? {} : { txHash: patch.txHash }),
      data: mergeData(current.data, patch.data),
      version: current.version + 1,
      updatedAt: patch.now ?? Date.now(),
    };
    this.purchases.set(id, next);
    return next;
  }

  async recordSnapshot(input: Omit<EvidenceSnapshotRecord, 'createdAt'> & { now?: number }): Promise<{ record: EvidenceSnapshotRecord; created: boolean }> {
    const key = `${input.evidenceNeedId}:${input.responseHash}`;
    const existingId = this.snapshotByNeedHash.get(key);
    if (existingId) {
      const existing = this.snapshots.get(existingId)!;
      if (existing.reliability !== input.reliability || existing.state !== input.state || existing.source !== input.source) throw new EvidenceRuntimeDuplicateError(`evidence_snapshot.hash:${key}`);
      return { record: existing, created: false };
    }
    if (!this.needs.has(input.evidenceNeedId)) throw new EvidenceRuntimeConflictError(`unknown evidence need ${input.evidenceNeedId}`);
    if (this.snapshots.has(input.id)) throw new EvidenceRuntimeDuplicateError(`evidence_snapshot.id:${input.id}`);
    const record: EvidenceSnapshotRecord = { ...input, createdAt: input.now ?? Date.now() };
    this.snapshots.set(record.id, record);
    this.snapshotByNeedHash.set(key, record.id);
    return { record, created: true };
  }

  async listSnapshots(evidenceNeedId: string): Promise<readonly EvidenceSnapshotRecord[]> {
    return [...this.snapshots.values()].filter((snapshot) => snapshot.evidenceNeedId === evidenceNeedId).sort((a, b) => b.capturedAt - a.capturedAt);
  }

  async createBlocker(input: Omit<QualificationBlockerRecord, 'version' | 'createdAt' | 'updatedAt' | 'state' | 'resolvedAt'> & { now?: number }): Promise<{ record: QualificationBlockerRecord; created: boolean }> {
    const existingId = this.blockersByKey.get(input.blockerKey);
    if (existingId) {
      const existing = this.blockers.get(existingId)!;
      if (!sameBlockerIdentity(existing, input)) throw new EvidenceRuntimeDuplicateError(`qualification_blocker.key:${input.blockerKey}`);
      return { record: existing, created: false };
    }
    if (this.blockers.has(input.id)) throw new EvidenceRuntimeDuplicateError(`qualification_blocker.id:${input.id}`);
    const now = input.now ?? Date.now();
    const record: QualificationBlockerRecord = { ...input, state: 'open', version: 1, createdAt: now, updatedAt: now, data: input.data };
    this.blockers.set(record.id, record);
    this.blockersByKey.set(record.blockerKey, record.id);
    return { record, created: true };
  }

  async getBlocker(id: string): Promise<QualificationBlockerRecord | null> { return this.blockers.get(id) ?? null; }
  async getBlockerByKey(key: string): Promise<QualificationBlockerRecord | null> { const id = this.blockersByKey.get(key); return id ? this.blockers.get(id) ?? null : null; }
  async listOpenBlockersForSubject(subject: string, limit = 100): Promise<readonly QualificationBlockerRecord[]> {
    const normalized = subject.trim().toLowerCase();
    return [...this.blockers.values()]
      .filter((blocker) => blocker.state === 'open' && blocker.subject.toLowerCase() === normalized)
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, Math.max(1, Math.min(500, Math.floor(limit))))
      .map((blocker) => structuredClone(blocker));
  }

  async resolveBlocker(id: string, expectedVersion: number, state: Extract<QualificationBlockerState, 'resolved' | 'cancelled' | 'expired'>, data?: RuntimeData, now = Date.now()): Promise<QualificationBlockerRecord> {
    const current = this.blockers.get(id);
    if (!current || current.version !== expectedVersion) throw new EvidenceRuntimeConflictError(`qualification blocker ${id} version ${expectedVersion} is stale`);
    if (current.state !== 'open' && current.state !== state) throw new EvidenceRuntimeConflictError(`invalid qualification blocker transition ${current.state}->${state}`);
    const next = { ...current, state, resolvedAt: current.resolvedAt ?? now, data: mergeData(current.data, data), version: current.version + 1, updatedAt: now };
    this.blockers.set(id, next);
    return next;
  }
}

interface NeedRow extends Record<string, unknown> { id: string; deal_room_id: string; need_key: string; kind: string; state: EvidenceNeedState; risk_class: string; version: number | string; created_at: number | string; updated_at: number | string; data: RuntimeData }
interface PurchaseRow extends Record<string, unknown> { id: string; evidence_need_id: string; idempotency_key: string; provider_id: string; state: EvidencePurchaseState; price_usdc: string; provider_transaction_id: string | null; tx_hash: string | null; version: number | string; created_at: number | string; updated_at: number | string; data: RuntimeData }
interface SnapshotRow extends Record<string, unknown> { id: string; evidence_need_id: string; purchase_id: string | null; source: string; captured_at: number | string; reliability: number; state: EvidenceSnapshotState; response_hash: string; provenance: readonly string[]; created_at: number | string }
interface BlockerRow extends Record<string, unknown> { id: string; deal_room_id: string; blocker_key: string; kind: string; state: QualificationBlockerState; subject: string; version: number | string; created_at: number | string; updated_at: number | string; resolved_at: number | string | null; data: RuntimeData }

function integer(value: number | string, label: string): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe evidence runtime ${label}`); return parsed; }
function needFrom(row: NeedRow): EvidenceNeedRecord { return { id: row.id, dealRoomId: row.deal_room_id, needKey: row.need_key, kind: row.kind, state: row.state, riskClass: row.risk_class, version: integer(row.version, 'need version'), createdAt: integer(row.created_at, 'need created_at'), updatedAt: integer(row.updated_at, 'need updated_at'), data: row.data }; }
function purchaseFrom(row: PurchaseRow): EvidencePurchaseRecord { return { id: row.id, evidenceNeedId: row.evidence_need_id, idempotencyKey: row.idempotency_key, providerId: row.provider_id, state: row.state, priceUsdc: row.price_usdc, ...(row.provider_transaction_id ? { providerTransactionId: row.provider_transaction_id } : {}), ...(row.tx_hash ? { txHash: row.tx_hash } : {}), version: integer(row.version, 'purchase version'), createdAt: integer(row.created_at, 'purchase created_at'), updatedAt: integer(row.updated_at, 'purchase updated_at'), data: row.data }; }
function snapshotFrom(row: SnapshotRow): EvidenceSnapshotRecord { return { id: row.id, evidenceNeedId: row.evidence_need_id, ...(row.purchase_id ? { purchaseId: row.purchase_id } : {}), source: row.source, capturedAt: integer(row.captured_at, 'snapshot captured_at'), reliability: row.reliability, state: row.state, responseHash: row.response_hash, provenance: row.provenance, createdAt: integer(row.created_at, 'snapshot created_at') }; }
function blockerFrom(row: BlockerRow): QualificationBlockerRecord { return { id: row.id, dealRoomId: row.deal_room_id, blockerKey: row.blocker_key, kind: row.kind, state: row.state, subject: row.subject, version: integer(row.version, 'blocker version'), createdAt: integer(row.created_at, 'blocker created_at'), updatedAt: integer(row.updated_at, 'blocker updated_at'), ...(row.resolved_at === null ? {} : { resolvedAt: integer(row.resolved_at, 'blocker resolved_at') }), data: row.data }; }

export class PostgresEvidenceRuntimeRepository implements EvidenceRuntimeRepository {
  constructor(private readonly executor: SqlExecutor, private readonly transaction: TransactionRunner) {}

  async createNeed(input: Omit<EvidenceNeedRecord, 'version' | 'createdAt' | 'updatedAt' | 'state'> & { now?: number }): Promise<{ record: EvidenceNeedRecord; created: boolean }> {
    return this.transaction(async (tx) => {
      const now = input.now ?? Date.now();
      const inserted = await tx.query<NeedRow>(`INSERT INTO evidence_needs (id, deal_room_id, need_key, kind, state, risk_class, created_at, updated_at, data) VALUES ($1,$2,$3,$4,'open',$5,$6,$6,$7::jsonb) ON CONFLICT (need_key) DO NOTHING RETURNING *`, [input.id, input.dealRoomId, input.needKey, input.kind, input.riskClass, now, JSON.stringify(input.data)]);
      const row = inserted.rows[0] ?? (await tx.query<NeedRow>('SELECT * FROM evidence_needs WHERE need_key = $1', [input.needKey])).rows[0];
      if (!row) throw new Error(`evidence need was not persisted: ${input.needKey}`);
      const record = needFrom(row);
      if (!sameNeedIdentity(record, input)) throw new EvidenceRuntimeDuplicateError(`evidence_need.key:${input.needKey}`);
      return { record, created: inserted.rows.length > 0 };
    });
  }
  async getNeed(id: string): Promise<EvidenceNeedRecord | null> { const row = (await this.executor.query<NeedRow>('SELECT * FROM evidence_needs WHERE id = $1', [id])).rows[0]; return row ? needFrom(row) : null; }
  async updateNeed(id: string, expectedVersion: number, state: EvidenceNeedState, data?: RuntimeData, now = Date.now()): Promise<EvidenceNeedRecord> {
    return this.transaction(async (tx) => {
      const currentRow = (await tx.query<NeedRow>('SELECT * FROM evidence_needs WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!currentRow || integer(currentRow.version, 'need version') !== expectedVersion) throw new EvidenceRuntimeConflictError(`evidence need ${id} version ${expectedVersion} is stale`);
      const current = needFrom(currentRow);
      if (current.state !== state && (current.state !== 'open' || state === 'open')) throw new EvidenceRuntimeConflictError(`invalid evidence need transition ${current.state}->${state}`);
      const row = (await tx.query<NeedRow>('UPDATE evidence_needs SET state = $2, data = data || $3::jsonb, version = version + 1, updated_at = $4 WHERE id = $1 RETURNING *', [id, state, JSON.stringify(data ?? {}), now])).rows[0]!;
      return needFrom(row);
    });
  }
  async createPurchase(input: Omit<EvidencePurchaseRecord, 'version' | 'createdAt' | 'updatedAt' | 'state'> & { now?: number }): Promise<{ record: EvidencePurchaseRecord; created: boolean }> {
    return this.transaction(async (tx) => {
      const now = input.now ?? Date.now();
      const inserted = await tx.query<PurchaseRow>(`INSERT INTO evidence_purchases_v2 (id, evidence_need_id, idempotency_key, provider_id, state, price_usdc, version, created_at, updated_at, data) VALUES ($1,$2,$3,$4,'created',$5,1,$6,$6,$7::jsonb) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [input.id, input.evidenceNeedId, input.idempotencyKey, input.providerId, input.priceUsdc, now, JSON.stringify(input.data)]);
      const row = inserted.rows[0] ?? (await tx.query<PurchaseRow>('SELECT * FROM evidence_purchases_v2 WHERE idempotency_key = $1', [input.idempotencyKey])).rows[0];
      if (!row) throw new Error(`evidence purchase was not persisted: ${input.idempotencyKey}`);
      const record = purchaseFrom(row);
      if (record.evidenceNeedId !== input.evidenceNeedId || record.providerId !== input.providerId || record.priceUsdc !== input.priceUsdc) throw new EvidenceRuntimeDuplicateError(`evidence_purchase.key:${input.idempotencyKey}`);
      return { record, created: inserted.rows.length > 0 };
    });
  }
  async getPurchase(id: string): Promise<EvidencePurchaseRecord | null> { const row = (await this.executor.query<PurchaseRow>('SELECT * FROM evidence_purchases_v2 WHERE id = $1', [id])).rows[0]; return row ? purchaseFrom(row) : null; }
  async getPurchaseByIdempotencyKey(key: string): Promise<EvidencePurchaseRecord | null> { const row = (await this.executor.query<PurchaseRow>('SELECT * FROM evidence_purchases_v2 WHERE idempotency_key = $1', [key])).rows[0]; return row ? purchaseFrom(row) : null; }
  async listPurchasesByState(states: readonly EvidencePurchaseState[], limit = 100): Promise<readonly EvidencePurchaseRecord[]> {
    const normalized = [...new Set(states)];
    if (normalized.length === 0) return [];
    const result = await this.executor.query<PurchaseRow>(
      `SELECT * FROM evidence_purchases_v2
         WHERE state = ANY($1::text[])
         ORDER BY updated_at ASC LIMIT $2`,
      [normalized, Math.max(1, Math.min(500, Math.floor(limit)))],
    );
    return result.rows.map(purchaseFrom);
  }
  async updatePurchase(id: string, expectedVersion: number, state: EvidencePurchaseState, patch: Partial<Pick<EvidencePurchaseRecord, 'providerTransactionId' | 'txHash' | 'data'>> & { now?: number } = {}): Promise<EvidencePurchaseRecord> {
    return this.transaction(async (tx) => {
      const currentRow = (await tx.query<PurchaseRow>('SELECT * FROM evidence_purchases_v2 WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!currentRow || integer(currentRow.version, 'purchase version') !== expectedVersion) throw new EvidenceRuntimeConflictError(`evidence purchase ${id} version ${expectedVersion} is stale`);
      const current = purchaseFrom(currentRow);
      nextPurchaseState(current.state, state);
      assertSettledPurchase(current, state, patch.txHash);
      const row = (await tx.query<PurchaseRow>('UPDATE evidence_purchases_v2 SET state=$2, provider_transaction_id=COALESCE($3, provider_transaction_id), tx_hash=COALESCE($4, tx_hash), data=data || $5::jsonb, version=version+1, updated_at=$6 WHERE id=$1 RETURNING *', [id, state, patch.providerTransactionId ?? null, patch.txHash ?? null, JSON.stringify(patch.data ?? {}), patch.now ?? Date.now()])).rows[0]!;
      return purchaseFrom(row);
    });
  }
  async recordSnapshot(input: Omit<EvidenceSnapshotRecord, 'createdAt'> & { now?: number }): Promise<{ record: EvidenceSnapshotRecord; created: boolean }> {
    return this.transaction(async (tx) => {
      const now = input.now ?? Date.now();
      const inserted = await tx.query<SnapshotRow>(`INSERT INTO evidence_snapshots_v2 (id, evidence_need_id, purchase_id, source, captured_at, reliability, state, response_hash, provenance, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) ON CONFLICT (evidence_need_id, response_hash) DO NOTHING RETURNING *`, [input.id, input.evidenceNeedId, input.purchaseId ?? null, input.source, input.capturedAt, input.reliability, input.state, input.responseHash, JSON.stringify(input.provenance), now]);
      const row = inserted.rows[0] ?? (await tx.query<SnapshotRow>('SELECT * FROM evidence_snapshots_v2 WHERE evidence_need_id = $1 AND response_hash = $2', [input.evidenceNeedId, input.responseHash])).rows[0];
      if (!row) throw new Error(`evidence snapshot was not persisted: ${input.responseHash}`);
      const record = snapshotFrom(row);
      if (record.source !== input.source || record.reliability !== input.reliability || record.state !== input.state) throw new EvidenceRuntimeDuplicateError(`evidence_snapshot.hash:${input.evidenceNeedId}:${input.responseHash}`);
      return { record, created: inserted.rows.length > 0 };
    });
  }
  async listSnapshots(evidenceNeedId: string): Promise<readonly EvidenceSnapshotRecord[]> { const rows = await this.executor.query<SnapshotRow>('SELECT * FROM evidence_snapshots_v2 WHERE evidence_need_id = $1 ORDER BY captured_at DESC', [evidenceNeedId]); return rows.rows.map(snapshotFrom); }
  async createBlocker(input: Omit<QualificationBlockerRecord, 'version' | 'createdAt' | 'updatedAt' | 'state' | 'resolvedAt'> & { now?: number }): Promise<{ record: QualificationBlockerRecord; created: boolean }> {
    return this.transaction(async (tx) => {
      const now = input.now ?? Date.now();
      const inserted = await tx.query<BlockerRow>(`INSERT INTO qualification_blockers (id, deal_room_id, blocker_key, kind, state, subject, version, created_at, updated_at, data) VALUES ($1,$2,$3,$4,'open',$5,1,$6,$6,$7::jsonb) ON CONFLICT (blocker_key) DO NOTHING RETURNING *`, [input.id, input.dealRoomId, input.blockerKey, input.kind, input.subject, now, JSON.stringify(input.data)]);
      const row = inserted.rows[0] ?? (await tx.query<BlockerRow>('SELECT * FROM qualification_blockers WHERE blocker_key = $1', [input.blockerKey])).rows[0];
      if (!row) throw new Error(`qualification blocker was not persisted: ${input.blockerKey}`);
      const record = blockerFrom(row);
      if (!sameBlockerIdentity(record, input)) throw new EvidenceRuntimeDuplicateError(`qualification_blocker.key:${input.blockerKey}`);
      return { record, created: inserted.rows.length > 0 };
    });
  }
  async getBlocker(id: string): Promise<QualificationBlockerRecord | null> { const row = (await this.executor.query<BlockerRow>('SELECT * FROM qualification_blockers WHERE id = $1', [id])).rows[0]; return row ? blockerFrom(row) : null; }
  async getBlockerByKey(key: string): Promise<QualificationBlockerRecord | null> { const row = (await this.executor.query<BlockerRow>('SELECT * FROM qualification_blockers WHERE blocker_key = $1', [key])).rows[0]; return row ? blockerFrom(row) : null; }
  async listOpenBlockersForSubject(subject: string, limit = 100): Promise<readonly QualificationBlockerRecord[]> {
    const maximum = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = await this.executor.query<BlockerRow>(
      `SELECT * FROM qualification_blockers
         WHERE state = 'open' AND lower(subject) = lower($1)
         ORDER BY updated_at ASC LIMIT $2`,
      [subject.trim(), maximum],
    );
    return rows.rows.map(blockerFrom);
  }
  async resolveBlocker(id: string, expectedVersion: number, state: Extract<QualificationBlockerState, 'resolved' | 'cancelled' | 'expired'>, data?: RuntimeData, now = Date.now()): Promise<QualificationBlockerRecord> {
    return this.transaction(async (tx) => {
      const currentRow = (await tx.query<BlockerRow>('SELECT * FROM qualification_blockers WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!currentRow || integer(currentRow.version, 'blocker version') !== expectedVersion) throw new EvidenceRuntimeConflictError(`qualification blocker ${id} version ${expectedVersion} is stale`);
      const current = blockerFrom(currentRow);
      if (current.state !== 'open' && current.state !== state) throw new EvidenceRuntimeConflictError(`invalid qualification blocker transition ${current.state}->${state}`);
      const row = (await tx.query<BlockerRow>('UPDATE qualification_blockers SET state=$2, resolved_at=COALESCE(resolved_at,$3), data=data || $4::jsonb, version=version+1, updated_at=$3 WHERE id=$1 RETURNING *', [id, state, now, JSON.stringify(data ?? {})])).rows[0]!;
      return blockerFrom(row);
    });
  }
}

export interface EvidenceRuntimeAuditRecords {
  needs: readonly EvidenceNeedRecord[];
  purchases: readonly EvidencePurchaseRecord[];
  blockers: readonly QualificationBlockerRecord[];
  snapshots?: readonly EvidenceSnapshotRecord[];
}

export interface EvidenceRuntimeAuditSummary {
  needs: number;
  purchases: number;
  blockers: number;
  unknownPurchases: number;
  openBlockers: number;
  /** Settled payments without a transaction hash or fresh linked evidence. */
  settlementConflicts: number;
}

export interface EvidenceRuntimeAuditStore {
  list(limit?: number): Promise<EvidenceRuntimeAuditRecords>;
  summary(): Promise<EvidenceRuntimeAuditSummary>;
}

function boundedLimit(limit: number): number { return Math.max(1, Math.min(limit, 500)); }

export class InMemoryEvidenceRuntimeAuditStore implements EvidenceRuntimeAuditStore {
  constructor(private readonly records: EvidenceRuntimeAuditRecords) {}
  async list(limit = 100): Promise<EvidenceRuntimeAuditRecords> {
    const maximum = boundedLimit(limit);
    return {
      needs: this.records.needs.slice(0, maximum),
      purchases: this.records.purchases.slice(0, maximum),
      blockers: this.records.blockers.slice(0, maximum),
    };
  }
  async summary(): Promise<EvidenceRuntimeAuditSummary> {
    const records = this.records;
    const snapshotsByPurchase = new Map<string, readonly EvidenceSnapshotRecord[]>();
    for (const snapshot of records.snapshots ?? []) {
      if (!snapshot.purchaseId) continue;
      const prior = snapshotsByPurchase.get(snapshot.purchaseId) ?? [];
      snapshotsByPurchase.set(snapshot.purchaseId, [...prior, snapshot]);
    }
    return {
      needs: records.needs.length,
      purchases: records.purchases.length,
      blockers: records.blockers.length,
      unknownPurchases: records.purchases.filter((purchase) => purchase.state === 'unknown' || purchase.state === 'reconciling').length,
      openBlockers: records.blockers.filter((blocker) => blocker.state === 'open').length,
      settlementConflicts: records.purchases.filter((purchase) => {
        if (purchase.state !== 'settled' || !purchase.txHash) return purchase.state === 'settled';
        const linked = snapshotsByPurchase.get(purchase.id) ?? [];
        return linked.length === 0 || !linked.some((snapshot) => snapshot.state === 'fresh');
      }).length,
    };
  }
}

export class PostgresEvidenceRuntimeAuditStore implements EvidenceRuntimeAuditStore {
  constructor(private readonly executor: SqlExecutor) {}
  async list(limit = 100): Promise<EvidenceRuntimeAuditRecords> {
    const maximum = boundedLimit(limit);
    const needs = await this.executor.query<NeedRow>('SELECT * FROM evidence_needs ORDER BY updated_at DESC LIMIT $1', [maximum]);
    const purchases = await this.executor.query<PurchaseRow>('SELECT * FROM evidence_purchases_v2 ORDER BY updated_at DESC LIMIT $1', [maximum]);
    const blockers = await this.executor.query<BlockerRow>('SELECT * FROM qualification_blockers ORDER BY updated_at DESC LIMIT $1', [maximum]);
    return {
      needs: needs.rows.map(needFrom),
      purchases: purchases.rows.map(purchaseFrom),
      blockers: blockers.rows.map(blockerFrom),
    };
  }
  async summary(): Promise<EvidenceRuntimeAuditSummary> {
    const result = await this.executor.query<{
      needs: string;
      purchases: string;
      blockers: string;
      unknown_purchases: string;
      open_blockers: string;
      settlement_conflicts: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM evidence_needs) AS needs,
         (SELECT COUNT(*) FROM evidence_purchases_v2) AS purchases,
         (SELECT COUNT(*) FROM qualification_blockers) AS blockers,
         (SELECT COUNT(*) FROM evidence_purchases_v2 WHERE state IN ('unknown','reconciling')) AS unknown_purchases,
         (SELECT COUNT(*) FROM qualification_blockers WHERE state = 'open') AS open_blockers,
         (SELECT COUNT(*)
            FROM evidence_purchases_v2 p
           WHERE p.state = 'settled'
             AND (
               p.tx_hash IS NULL
               OR NOT EXISTS (
                 SELECT 1
                   FROM evidence_snapshots_v2 s
                  WHERE s.purchase_id = p.id
                    AND s.state = 'fresh'
               )
             )) AS settlement_conflicts`,
    );
    const row = result.rows[0];
    if (!row) throw new Error('evidence runtime summary returned no row');
    return {
      needs: integer(row.needs, 'summary needs'),
      purchases: integer(row.purchases, 'summary purchases'),
      blockers: integer(row.blockers, 'summary blockers'),
      unknownPurchases: integer(row.unknown_purchases, 'summary unknown purchases'),
      openBlockers: integer(row.open_blockers, 'summary open blockers'),
      settlementConflicts: integer(row.settlement_conflicts, 'summary settlement conflicts'),
    };
  }
}
