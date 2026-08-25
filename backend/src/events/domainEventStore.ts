import { EventEmitter } from 'node:events';
import {
  canTransitionDealRoom,
  type DealRoomState,
} from '../domain/agentRuntimeState.js';
import {
  OptimisticConcurrencyError,
  type DealRoomRecord,
  type RuntimeData,
} from '../db/agentRuntime.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { KarwanEvent, KarwanEventType } from '../events.js';

export interface StructuredOfferSnapshot {
  id: string;
  version: number;
  amountUsdc: string;
  updatedAt: number;
  deadlineUnix?: number;
  /** Immutable mandate versions used to authorize this offer. */
  buyerMandateVersion: number;
  sellerMandateVersion: number;
  summary?: string;
}

export interface DomainEventV2 {
  id: string;
  aggregateType: 'deal_room';
  aggregateId: string;
  aggregateVersion: number;
  sequence: number;
  category: string;
  type: KarwanEventType;
  actor: KarwanEvent['actor'];
  jobId: string;
  payload: Record<string, unknown>;
  structuredOffer?: StructuredOfferSnapshot;
  occurredAt: number;
}

export interface DealRoomStreamRecord extends DealRoomRecord {
  lastSequence: number;
}

export interface DealRoomMutationResult {
  room: DealRoomStreamRecord;
  event: DomainEventV2;
  replayed: boolean;
}

export interface DealRoomEventMutation {
  eventId: string;
  dealRoomId: string;
  expectedVersion: number;
  nextState: DealRoomState;
  category: string;
  type: KarwanEventType;
  actor: KarwanEvent['actor'];
  payload: Record<string, unknown>;
  structuredOffer?: StructuredOfferSnapshot;
  dataPatch?: RuntimeData;
  now?: number;
}

export type TransactionRunner = <T>(
  operation: (executor: SqlExecutor) => Promise<T>,
) => Promise<T>;

interface DealRoomRow extends Record<string, unknown> {
  id: string;
  job_id: string;
  state: DealRoomState;
  version: number | string;
  last_sequence: number | string;
  created_at: number | string;
  updated_at: number | string;
  data: RuntimeData;
}

interface DomainEventRow extends Record<string, unknown> {
  id: string;
  aggregate_type: 'deal_room';
  aggregate_id: string;
  aggregate_version: number | string;
  sequence: number | string;
  category: string;
  type: KarwanEventType;
  actor: KarwanEvent['actor'];
  job_id: string;
  payload: Record<string, unknown>;
  occurred_at: number | string;
  data: { structuredOffer?: StructuredOfferSnapshot };
}

function safeInteger(value: number | string, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`unsafe ${label}: ${String(value)}`);
  return result;
}

function assertStructuredOfferSnapshot(snapshot: StructuredOfferSnapshot): void {
  if (!snapshot.id.trim()) throw new Error('structured offer id is required');
  if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1) {
    throw new Error('structured offer version must be a positive integer');
  }
  if (!snapshot.amountUsdc.trim()) throw new Error('structured offer amount is required');
  if (!Number.isSafeInteger(snapshot.buyerMandateVersion) || snapshot.buyerMandateVersion < 1) {
    throw new Error('structured offer buyer mandate version must be a positive integer');
  }
  if (!Number.isSafeInteger(snapshot.sellerMandateVersion) || snapshot.sellerMandateVersion < 1) {
    throw new Error('structured offer seller mandate version must be a positive integer');
  }
}

function roomFrom(row: DealRoomRow): DealRoomStreamRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    state: row.state,
    version: safeInteger(row.version, 'DealRoom version'),
    lastSequence: safeInteger(row.last_sequence, 'DealRoom last_sequence'),
    createdAt: safeInteger(row.created_at, 'DealRoom created_at'),
    updatedAt: safeInteger(row.updated_at, 'DealRoom updated_at'),
    data: row.data,
  };
}

function eventFrom(row: DomainEventRow): DomainEventV2 {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: safeInteger(row.aggregate_version, 'aggregate version'),
    sequence: safeInteger(row.sequence, 'stream sequence'),
    category: row.category,
    type: row.type,
    actor: row.actor,
    jobId: row.job_id,
    payload: row.payload,
    ...(row.data?.structuredOffer ? { structuredOffer: row.data.structuredOffer } : {}),
    occurredAt: safeInteger(row.occurred_at, 'occurred_at'),
  };
}

export function domainEventToKarwanEvent(event: DomainEventV2): KarwanEvent {
  return {
    eventId: event.id,
    dealRoomId: event.aggregateId,
    sequence: event.sequence,
    aggregateVersion: event.aggregateVersion,
    ...(event.structuredOffer ? { structuredOffer: event.structuredOffer } : {}),
    type: event.type,
    jobId: event.jobId,
    actor: event.actor,
    ts: event.occurredAt,
    payload: event.payload,
  };
}

export class PostgresDomainEventStore {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly transaction: TransactionRunner,
  ) {}

  async mutateDealRoom(input: DealRoomEventMutation): Promise<DealRoomMutationResult> {
    if (!input.eventId.trim()) throw new Error('eventId is required');
    if (input.structuredOffer) assertStructuredOfferSnapshot(input.structuredOffer);
    return this.transaction(async (tx) => {
      const prior = await this.getEventById(input.eventId, tx);
      if (prior) {
        if (prior.aggregateId !== input.dealRoomId) {
          throw new Error(`event ${input.eventId} belongs to another aggregate`);
        }
        const room = await this.getDealRoom(input.dealRoomId, tx);
        if (!room) throw new Error(`deal room not found: ${input.dealRoomId}`);
        return { room, event: prior, replayed: true };
      }

      const rows = await tx.query<DealRoomRow>(
        'SELECT * FROM deal_rooms WHERE id = $1 FOR UPDATE',
        [input.dealRoomId],
      );
      const currentRow = rows.rows[0];
      if (!currentRow) throw new Error(`deal room not found: ${input.dealRoomId}`);
      const current = roomFrom(currentRow);
      // A concurrent retry can miss the optimistic read above, then wait here
      // while the first transaction commits. Re-check after taking the room
      // lock so the same event ID remains idempotent under that race.
      const concurrentPrior = await this.getEventById(input.eventId, tx);
      if (concurrentPrior) {
        if (concurrentPrior.aggregateId !== input.dealRoomId) {
          throw new Error(`event ${input.eventId} belongs to another aggregate`);
        }
        return { room: current, event: concurrentPrior, replayed: true };
      }
      if (current.version !== input.expectedVersion) {
        throw new OptimisticConcurrencyError('deal room', input.dealRoomId, input.expectedVersion);
      }
      if (!canTransitionDealRoom(current.state, input.nextState)) {
        throw new Error(`invalid deal room transition ${current.state} -> ${input.nextState}`);
      }

      const now = input.now ?? Date.now();
      const nextVersion = current.version + 1;
      const nextSequence = safeInteger(currentRow.last_sequence, 'last_sequence') + 1;
      const nextData = input.dataPatch
        ? { ...current.data, ...input.dataPatch }
        : current.data;
      const updated = await tx.query<DealRoomRow>(
        `UPDATE deal_rooms
         SET state = $3, version = $4, last_sequence = $5, updated_at = $6, data = $7
         WHERE id = $1 AND version = $2
         RETURNING *`,
        [
          input.dealRoomId,
          input.expectedVersion,
          input.nextState,
          nextVersion,
          nextSequence,
          now,
          nextData,
        ],
      );
      const nextRow = updated.rows[0];
      if (!nextRow) {
        throw new OptimisticConcurrencyError('deal room', input.dealRoomId, input.expectedVersion);
      }

      const eventData = input.structuredOffer
        ? { structuredOffer: input.structuredOffer }
        : {};
      const inserted = await tx.query<DomainEventRow>(
        `INSERT INTO domain_events_v2 (
           id, aggregate_type, aggregate_id, aggregate_version, sequence,
           category, type, actor, job_id, dedupe_key, occurred_at, payload, data
         ) VALUES ($1, 'deal_room', $2, $3, $4, $5, $6, $7, $8, $1, $9, $10, $11)
         RETURNING *`,
        [
          input.eventId,
          input.dealRoomId,
          nextVersion,
          nextSequence,
          input.category,
          input.type,
          input.actor,
          current.jobId,
          now,
          input.payload,
          eventData,
        ],
      );
      await tx.query(
        `INSERT INTO event_outbox_v2 (
           id, event_id, state, attempt, available_at, created_at, updated_at
         ) VALUES ($1, $2, 'pending', 0, $3, $3, $3)`,
        [`outbox:${input.eventId}`, input.eventId, now],
      );
      return {
        room: roomFrom(nextRow),
        event: eventFrom(inserted.rows[0]!),
        replayed: false,
      };
    });
  }

  async getDealRoom(
    id: string,
    executor: SqlExecutor = this.executor,
  ): Promise<DealRoomStreamRecord | null> {
    const result = await executor.query<DealRoomRow>('SELECT * FROM deal_rooms WHERE id = $1', [id]);
    return result.rows[0] ? roomFrom(result.rows[0]) : null;
  }

  async findDealRoomByJobId(jobId: string): Promise<DealRoomStreamRecord | null> {
    const result = await this.executor.query<DealRoomRow>(
      'SELECT * FROM deal_rooms WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
      [jobId],
    );
    return result.rows[0] ? roomFrom(result.rows[0]) : null;
  }

  async listAfterSequence(
    dealRoomId: string,
    afterSequence: number,
    limit = 500,
  ): Promise<DomainEventV2[]> {
    const safeAfter = Math.max(0, Math.floor(afterSequence) || 0);
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit) || 500));
    const result = await this.executor.query<DomainEventRow>(
      `SELECT * FROM domain_events_v2
       WHERE aggregate_type = 'deal_room' AND aggregate_id = $1 AND sequence > $2
       ORDER BY sequence ASC LIMIT $3`,
      [dealRoomId, safeAfter, safeLimit],
    );
    return result.rows.map(eventFrom);
  }

  async listAfterJobSequence(
    jobId: string,
    afterSequence: number,
    limit = 500,
  ): Promise<DomainEventV2[]> {
    const room = await this.findDealRoomByJobId(jobId);
    return room ? this.listAfterSequence(room.id, afterSequence, limit) : [];
  }

  private async getEventById(
    id: string,
    executor: SqlExecutor = this.executor,
  ): Promise<DomainEventV2 | null> {
    const result = await executor.query<DomainEventRow>(
      'SELECT * FROM domain_events_v2 WHERE id = $1',
      [id],
    );
    return result.rows[0] ? eventFrom(result.rows[0]) : null;
  }
}

class DomainEventLiveBus extends EventEmitter {
  publish(event: DomainEventV2): void {
    this.emit('event', event);
  }

  subscribe(handler: (event: DomainEventV2) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

export const domainEventLiveBus = new DomainEventLiveBus();
domainEventLiveBus.setMaxListeners(0);
