import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseUsdcMicro } from '../matching/money.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { NegotiationMandates } from './structuredOffer.js';

export type MandateRole = 'BUYER' | 'SELLER';

const decimalUsdc = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);
export const negotiationMandatesSchema = z.object({
  buyerMaxPriceUsdc: decimalUsdc,
  sellerMinPriceUsdc: decimalUsdc,
  earliestDeadlineUnix: z.number().int().positive().optional(),
  latestDeadlineUnix: z.number().int().positive().optional(),
  buyerMandateVersion: z.number().int().positive(),
  sellerMandateVersion: z.number().int().positive(),
}).strict().superRefine((value, ctx) => {
  if (parseUsdcMicro(value.sellerMinPriceUsdc) > parseUsdcMicro(value.buyerMaxPriceUsdc)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sellerMinPriceUsdc'], message: 'seller floor exceeds buyer cap' });
  }
  if (value.earliestDeadlineUnix !== undefined
    && value.latestDeadlineUnix !== undefined
    && value.earliestDeadlineUnix > value.latestDeadlineUnix) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latestDeadlineUnix'], message: 'latest deadline precedes earliest deadline' });
  }
});

export function parseNegotiationMandates(input: unknown): NegotiationMandates {
  return negotiationMandatesSchema.parse(input);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

export function mandateConstraintsHash(role: MandateRole, mandates: NegotiationMandates): string {
  const parsed = parseNegotiationMandates(mandates);
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ role, mandates: parsed })))
    .digest('hex');
}

export interface MandateSnapshotRecord {
  id: string;
  dealRoomId: string;
  role: MandateRole;
  version: number;
  constraintsHash: string;
  mandates: NegotiationMandates;
  createdAt: number;
}

export interface MandateSnapshotStore {
  put(input: {
    dealRoomId: string;
    role: MandateRole;
    version: number;
    mandates: NegotiationMandates;
    createdAt: number;
  }): Promise<{ record: MandateSnapshotRecord; created: boolean }>;
  get(dealRoomId: string, role: MandateRole, version: number): Promise<MandateSnapshotRecord | null>;
}

type MandateInput = Parameters<MandateSnapshotStore['put']>[0];

function normalizedInput(input: MandateInput): MandateSnapshotRecord {
  const dealRoomId = input.dealRoomId.trim();
  if (!dealRoomId) throw new Error('mandate deal room id is required');
  const mandates = parseNegotiationMandates(input.mandates);
  const expectedVersion = input.role === 'BUYER'
    ? mandates.buyerMandateVersion
    : mandates.sellerMandateVersion;
  if (input.version !== expectedVersion) throw new Error(`MANDATE_VERSION_MISMATCH_${input.role}`);
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) throw new Error('invalid mandate timestamp');
  const constraintsHash = mandateConstraintsHash(input.role, mandates);
  return {
    id: `mandate:${dealRoomId}:${input.role}:${input.version}`,
    dealRoomId,
    role: input.role,
    version: input.version,
    constraintsHash,
    mandates,
    createdAt: input.createdAt,
  };
}

export class MandateVersionConflictError extends Error {
  constructor(id: string) {
    super(`mandate version conflicts with an existing immutable snapshot: ${id}`);
    this.name = 'MandateVersionConflictError';
  }
}

export class InMemoryMandateSnapshotStore implements MandateSnapshotStore {
  private readonly records = new Map<string, MandateSnapshotRecord>();

  async put(input: MandateInput): Promise<{ record: MandateSnapshotRecord; created: boolean }> {
    const record = normalizedInput(input);
    const prior = this.records.get(record.id);
    if (prior) {
      if (prior.constraintsHash !== record.constraintsHash) throw new MandateVersionConflictError(record.id);
      return { record: prior, created: false };
    }
    this.records.set(record.id, record);
    return { record, created: true };
  }

  async get(dealRoomId: string, role: MandateRole, version: number): Promise<MandateSnapshotRecord | null> {
    return this.records.get(`mandate:${dealRoomId.trim()}:${role}:${version}`) ?? null;
  }
}

interface MandateRow extends Record<string, unknown> {
  id: string;
  deal_room_id: string;
  role: MandateRole;
  mandate_version: number | string;
  constraints_hash: string;
  constraints: unknown;
  created_at: number | string;
}

function rowToRecord(row: MandateRow): MandateSnapshotRecord {
  const record = normalizedInput({
    dealRoomId: String(row.deal_room_id),
    role: row.role,
    version: Number(row.mandate_version),
    mandates: parseNegotiationMandates(row.constraints),
    createdAt: Number(row.created_at),
  });
  if (record.id !== String(row.id) || record.constraintsHash !== String(row.constraints_hash)) {
    throw new Error('mandate snapshot integrity mismatch');
  }
  return record;
}

export class PostgresMandateSnapshotStore implements MandateSnapshotStore {
  constructor(private readonly executor: SqlExecutor) {}

  async put(input: MandateInput): Promise<{ record: MandateSnapshotRecord; created: boolean }> {
    const record = normalizedInput(input);
    const inserted = await this.executor.query<MandateRow>(
      `INSERT INTO negotiation_mandates_v2 (
         id, deal_room_id, role, mandate_version, constraints_hash, constraints, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (deal_room_id, role, mandate_version) DO NOTHING
       RETURNING *`,
      [record.id, record.dealRoomId, record.role, record.version, record.constraintsHash, record.mandates, record.createdAt],
    );
    if (inserted.rows[0]) return { record: rowToRecord(inserted.rows[0]), created: true };
    const existing = await this.executor.query<MandateRow>(
      `SELECT * FROM negotiation_mandates_v2
       WHERE deal_room_id = $1 AND role = $2 AND mandate_version = $3`,
      [record.dealRoomId, record.role, record.version],
    );
    if (!existing.rows[0]) throw new Error('mandate snapshot insert was not observable');
    const prior = rowToRecord(existing.rows[0]);
    if (prior.constraintsHash !== record.constraintsHash) throw new MandateVersionConflictError(record.id);
    return { record: prior, created: false };
  }

  async get(dealRoomId: string, role: MandateRole, version: number): Promise<MandateSnapshotRecord | null> {
    const result = await this.executor.query<MandateRow>(
      `SELECT * FROM negotiation_mandates_v2
       WHERE deal_room_id = $1 AND role = $2 AND mandate_version = $3`,
      [dealRoomId.trim(), role, version],
    );
    return result.rows[0] ? rowToRecord(result.rows[0]) : null;
  }
}
