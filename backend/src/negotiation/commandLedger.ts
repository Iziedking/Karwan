import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '../db/migrations.js';

export interface NegotiationCommandResult<T = unknown> {
  commandId: string;
  idempotencyKey: string;
  kind: string;
  result: T;
  createdAt: number;
}

export interface NegotiationCommandAuditSummary {
  total: number;
  staleOfferAcceptances: number;
  duplicateCommandConflicts: number;
}

export interface NegotiationCommandAuditStore {
  summary(): Promise<NegotiationCommandAuditSummary>;
}

export interface NegotiationCommandConflictRecorder {
  recordConflict(input: {
    idempotencyKey: string;
    commandId: string;
    kind: string;
    createdAt: number;
  }): Promise<void>;
}

export class CommandIdempotencyConflict extends Error {
  constructor(key: string) {
    super(`negotiation command idempotency conflict: ${key}`);
    this.name = 'CommandIdempotencyConflict';
  }
}

export interface NegotiationCommandLedger {
  get(idempotencyKey: string): Promise<NegotiationCommandResult | null>;
  put<T>(entry: NegotiationCommandResult<T>): Promise<NegotiationCommandResult<T>>;
}

export class InMemoryNegotiationCommandLedger implements NegotiationCommandLedger, NegotiationCommandAuditStore, NegotiationCommandConflictRecorder {
  private readonly byKey = new Map<string, NegotiationCommandResult>();
  private readonly byCommand = new Map<string, string>();
  private duplicateCommandConflicts = 0;

  async get(idempotencyKey: string): Promise<NegotiationCommandResult | null> {
    return this.byKey.get(idempotencyKey) ?? null;
  }

  async put<T>(entry: NegotiationCommandResult<T>): Promise<NegotiationCommandResult<T>> {
    const priorKey = this.byCommand.get(entry.commandId);
    if (priorKey !== undefined && priorKey !== entry.idempotencyKey) {
      this.duplicateCommandConflicts += 1;
      throw new CommandIdempotencyConflict(entry.commandId);
    }
    const prior = this.byKey.get(entry.idempotencyKey);
    if (prior) {
      if (prior.commandId !== entry.commandId || prior.kind !== entry.kind) {
        this.duplicateCommandConflicts += 1;
        throw new CommandIdempotencyConflict(entry.idempotencyKey);
      }
      return prior as NegotiationCommandResult<T>;
    }
    this.byKey.set(entry.idempotencyKey, entry);
    this.byCommand.set(entry.commandId, entry.idempotencyKey);
    return entry;
  }

  async summary(): Promise<NegotiationCommandAuditSummary> {
    let staleOfferAcceptances = 0;
    for (const command of this.byKey.values()) {
      const result = command.result;
      if (command.kind === 'accept_offer' && typeof result === 'object' && result !== null
        && (result as { outcome?: unknown }).outcome === 'stale') {
        staleOfferAcceptances += 1;
      }
    }
    return { total: this.byKey.size, staleOfferAcceptances, duplicateCommandConflicts: this.duplicateCommandConflicts };
  }

  async recordConflict(_input: {
    idempotencyKey: string;
    commandId: string;
    kind: string;
    createdAt: number;
  }): Promise<void> {
    this.duplicateCommandConflicts += 1;
  }
}

interface CommandRow extends Record<string, unknown> {
  command_id: string;
  idempotency_key: string;
  kind: string;
  result: unknown;
  created_at: number | string;
}

function rowToResult(row: CommandRow): NegotiationCommandResult {
  const createdAt = Number(row.created_at);
  if (!Number.isSafeInteger(createdAt)) throw new Error('unsafe negotiation command timestamp');
  return {
    commandId: String(row.command_id),
    idempotencyKey: String(row.idempotency_key),
    kind: String(row.kind),
    result: row.result,
    createdAt,
  };
}

export class PostgresNegotiationCommandLedger implements NegotiationCommandLedger, NegotiationCommandAuditStore, NegotiationCommandConflictRecorder {
  constructor(private readonly executor: SqlExecutor) {}

  async get(idempotencyKey: string): Promise<NegotiationCommandResult | null> {
    const result = await this.executor.query<CommandRow>(
      'SELECT command_id, idempotency_key, kind, result, created_at FROM negotiation_commands_v2 WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    return result.rows[0] ? rowToResult(result.rows[0]) : null;
  }

  async put<T>(entry: NegotiationCommandResult<T>): Promise<NegotiationCommandResult<T>> {
    const result = await this.executor.query<CommandRow>(
      `INSERT INTO negotiation_commands_v2 (command_id, idempotency_key, kind, result, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING command_id, idempotency_key, kind, result, created_at`,
      [entry.commandId, entry.idempotencyKey, entry.kind, entry.result, entry.createdAt],
    );
    if (result.rows[0]) return rowToResult(result.rows[0]) as NegotiationCommandResult<T>;
    const prior = await this.executor.query<CommandRow>(
      'SELECT command_id, idempotency_key, kind, result, created_at FROM negotiation_commands_v2 WHERE idempotency_key = $1',
      [entry.idempotencyKey],
    );
    if (!prior.rows[0]) throw new Error('negotiation command insert was not observable');
    const existing = rowToResult(prior.rows[0]);
    if (existing.commandId !== entry.commandId || existing.kind !== entry.kind) {
      await this.recordConflict({
        idempotencyKey: entry.idempotencyKey,
        commandId: entry.commandId,
        kind: entry.kind,
        createdAt: entry.createdAt,
      });
      throw new CommandIdempotencyConflict(entry.idempotencyKey);
    }
    return existing as NegotiationCommandResult<T>;
  }

  async summary(): Promise<NegotiationCommandAuditSummary> {
    const result = await this.executor.query<{ total: number | string; stale_offer_acceptances: number | string }>(
      `SELECT COUNT(*)::bigint AS total,
              COUNT(*) FILTER (
                WHERE kind = 'accept_offer' AND result ->> 'outcome' = 'stale'
              )::bigint AS stale_offer_acceptances
       FROM negotiation_commands_v2`,
    );
    const row = result.rows[0];
    if (!row) return { total: 0, staleOfferAcceptances: 0, duplicateCommandConflicts: 0 };
    const total = Number(row.total);
    const staleOfferAcceptances = Number(row.stale_offer_acceptances);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(staleOfferAcceptances)) {
      throw new Error('unsafe negotiation command audit count');
    }
    const conflicts = await this.executor.query<{ duplicate_command_conflicts: number | string }>(
      'SELECT COUNT(*)::bigint AS duplicate_command_conflicts FROM negotiation_command_conflicts_v2',
    );
    const duplicateCommandConflicts = Number(conflicts.rows[0]?.duplicate_command_conflicts ?? 0);
    if (!Number.isSafeInteger(duplicateCommandConflicts) || duplicateCommandConflicts < 0) {
      throw new Error('unsafe negotiation command conflict count');
    }
    return { total, staleOfferAcceptances, duplicateCommandConflicts };
  }

  async recordConflict(input: {
    idempotencyKey: string;
    commandId: string;
    kind: string;
    createdAt: number;
  }): Promise<void> {
    const existing = await this.get(input.idempotencyKey);
    if (!existing) return;
    await this.executor.query(
      `INSERT INTO negotiation_command_conflicts_v2 (
         id, idempotency_key, attempted_command_id, attempted_kind,
         existing_command_id, existing_kind, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        `negotiation-conflict:${randomUUID()}`,
        input.idempotencyKey,
        input.commandId,
        input.kind,
        existing.commandId,
        existing.kind,
        input.createdAt,
      ],
    );
  }
}
