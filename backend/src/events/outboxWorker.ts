import type { SqlExecutor } from '../db/migrations.js';
import {
  domainEventLiveBus,
  type DomainEventV2,
  type TransactionRunner,
} from './domainEventStore.js';

export type OutboxState = 'pending' | 'delivering' | 'retry' | 'delivered' | 'dead_letter';

export interface OutboxEnvelope {
  id: string;
  eventId: string;
  state: OutboxState;
  attempt: number;
  availableAt: number;
  event: DomainEventV2;
}

export interface OutboxStore {
  claimDue(input: {
    workerId: string;
    now: number;
    leaseMs: number;
    limit: number;
  }): Promise<OutboxEnvelope[]>;
  markDelivered(id: string, workerId: string, now: number): Promise<void>;
  markFailed(input: {
    id: string;
    workerId: string;
    attempt: number;
    now: number;
    nextAvailableAt: number;
    error: string;
    deadLetter: boolean;
  }): Promise<void>;
}

export interface EventConsumer {
  name: string;
  consume(event: DomainEventV2): Promise<boolean>;
}

export interface OutboxDispatchSummary {
  delivered: number;
  retried: number;
  deadLettered: number;
}

export function outboxBackoffMs(
  attempt: number,
  baseMs = 1_000,
  capMs = 5 * 60_000,
): number {
  const exponent = Math.max(0, Math.min(20, Math.floor(attempt) - 1));
  return Math.min(capMs, baseMs * 2 ** exponent);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1_000);
}

export class OutboxDispatcher {
  constructor(
    private readonly store: OutboxStore,
    private readonly consumers: readonly EventConsumer[],
    private readonly options: {
      workerId: string;
      maxAttempts?: number;
      leaseMs?: number;
      batchSize?: number;
      baseBackoffMs?: number;
      maxBackoffMs?: number;
      afterConsumers?: (envelope: OutboxEnvelope) => Promise<void>;
    },
  ) {}

  async dispatchOnce(now = Date.now()): Promise<OutboxDispatchSummary> {
    const maxAttempts = this.options.maxAttempts ?? 8;
    const envelopes = await this.store.claimDue({
      workerId: this.options.workerId,
      now,
      leaseMs: this.options.leaseMs ?? 30_000,
      limit: this.options.batchSize ?? 25,
    });
    let delivered = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const envelope of envelopes) {
      try {
        for (const consumer of this.consumers) await consumer.consume(envelope.event);
        await this.options.afterConsumers?.(envelope);
        await this.store.markDelivered(envelope.id, this.options.workerId, now);
        delivered += 1;
      } catch (error) {
        const deadLetter = envelope.attempt >= maxAttempts;
        const nextAvailableAt = now + outboxBackoffMs(
          envelope.attempt,
          this.options.baseBackoffMs,
          this.options.maxBackoffMs,
        );
        await this.store.markFailed({
          id: envelope.id,
          workerId: this.options.workerId,
          attempt: envelope.attempt,
          now,
          nextAvailableAt,
          error: safeError(error),
          deadLetter,
        });
        if (deadLetter) deadLettered += 1;
        else retried += 1;
      }
    }
    return { delivered, retried, deadLettered };
  }
}

export function startOutboxDispatcherLoop(
  dispatcher: Pick<OutboxDispatcher, 'dispatchOnce'>,
  options: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
    onResult?: (result: OutboxDispatchSummary) => void;
  } = {},
): () => void {
  const intervalMs = Math.max(100, Math.floor(options.intervalMs ?? 1_000));
  let stopped = false;
  let inFlight = false;

  const dispatch = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const result = await dispatcher.dispatchOnce();
      options.onResult?.(result);
    } catch (error) {
      options.onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  void dispatch();
  const timer = setInterval(() => void dispatch(), intervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

interface OutboxClaimRow extends Record<string, unknown> {
  id: string;
  event_id: string;
  state: OutboxState;
  attempt: number | string;
  available_at: number | string;
}

interface EventRow extends Record<string, unknown> {
  id: string;
  aggregate_type: 'deal_room';
  aggregate_id: string;
  aggregate_version: number | string;
  sequence: number | string;
  category: string;
  type: DomainEventV2['type'];
  actor: DomainEventV2['actor'];
  job_id: string;
  payload: Record<string, unknown>;
  occurred_at: number | string;
  data: { structuredOffer?: DomainEventV2['structuredOffer'] };
}

function numberColumn(value: number | string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`unsafe outbox integer: ${String(value)}`);
  return result;
}

function mapEvent(row: EventRow): DomainEventV2 {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: numberColumn(row.aggregate_version),
    sequence: numberColumn(row.sequence),
    category: row.category,
    type: row.type,
    actor: row.actor,
    jobId: row.job_id,
    payload: row.payload,
    ...(row.data?.structuredOffer ? { structuredOffer: row.data.structuredOffer } : {}),
    occurredAt: numberColumn(row.occurred_at),
  };
}

export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly transaction: TransactionRunner) {}

  async claimDue(input: {
    workerId: string;
    now: number;
    leaseMs: number;
    limit: number;
  }): Promise<OutboxEnvelope[]> {
    return this.transaction(async (tx) => {
      const claimed = await tx.query<OutboxClaimRow>(
        `WITH due AS (
           SELECT id FROM event_outbox_v2
           WHERE (
             state IN ('pending', 'retry') AND available_at <= $1
           ) OR (
             state = 'delivering' AND lease_expires_at IS NOT NULL AND lease_expires_at <= $1
           )
           ORDER BY available_at ASC, created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE event_outbox_v2 AS outbox
         SET state = 'delivering',
             attempt = outbox.attempt + 1,
             lease_owner = $3,
             lease_expires_at = $4,
             updated_at = $1
         FROM due
         WHERE outbox.id = due.id
         RETURNING outbox.id, outbox.event_id, outbox.state,
                   outbox.attempt, outbox.available_at`,
        [input.now, Math.max(1, Math.min(100, input.limit)), input.workerId, input.now + input.leaseMs],
      );
      if (claimed.rows.length === 0) return [];
      const envelopes: OutboxEnvelope[] = [];
      for (const row of claimed.rows) {
        const eventResult = await tx.query<EventRow>(
          'SELECT * FROM domain_events_v2 WHERE id = $1',
          [row.event_id],
        );
        const eventRow = eventResult.rows[0];
        if (!eventRow) throw new Error(`outbox event not found: ${row.event_id}`);
        envelopes.push({
          id: row.id,
          eventId: row.event_id,
          state: row.state,
          attempt: numberColumn(row.attempt),
          availableAt: numberColumn(row.available_at),
          event: mapEvent(eventRow),
        });
      }
      return envelopes;
    });
  }

  async markDelivered(id: string, workerId: string, now: number): Promise<void> {
    await this.transaction(async (tx) => {
      const result = await tx.query(
        `UPDATE event_outbox_v2
         SET state = 'delivered', lease_owner = NULL, lease_expires_at = NULL,
             published_at = $3, updated_at = $3, last_error = NULL
         WHERE id = $1 AND state = 'delivering' AND lease_owner = $2
         RETURNING id`,
        [id, workerId, now],
      );
      if (result.rows.length !== 1) throw new Error(`outbox lease lost before delivery: ${id}`);
    });
  }

  async markFailed(input: {
    id: string;
    workerId: string;
    attempt: number;
    now: number;
    nextAvailableAt: number;
    error: string;
    deadLetter: boolean;
  }): Promise<void> {
    await this.transaction(async (tx) => {
      const result = await tx.query(
        `UPDATE event_outbox_v2
         SET state = $3, available_at = $4, lease_owner = NULL,
             lease_expires_at = NULL, updated_at = $5, last_error = $6
         WHERE id = $1 AND state = 'delivering' AND lease_owner = $2 AND attempt = $7
         RETURNING id`,
        [
          input.id,
          input.workerId,
          input.deadLetter ? 'dead_letter' : 'retry',
          input.nextAvailableAt,
          input.now,
          input.error,
          input.attempt,
        ],
      );
      if (result.rows.length !== 1) throw new Error(`outbox lease lost before failure update: ${input.id}`);
    });
  }
}

export class TransactionalEventConsumer implements EventConsumer {
  constructor(
    readonly name: string,
    private readonly transaction: TransactionRunner,
    private readonly handler: (executor: SqlExecutor, event: DomainEventV2) => Promise<void>,
  ) {}

  async consume(event: DomainEventV2): Promise<boolean> {
    return this.transaction(async (tx) => {
      const claimed = await tx.query(
        `INSERT INTO event_consumptions_v2 (consumer, event_id, processed_at, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (consumer, event_id) DO NOTHING
         RETURNING event_id`,
        [this.name, event.id, Date.now(), {}],
      );
      if (claimed.rows.length === 0) return false;
      await this.handler(tx, event);
      return true;
    });
  }
}

export function createNotificationJobConsumer(
  transaction: TransactionRunner,
): TransactionalEventConsumer {
  return new TransactionalEventConsumer(
    'notification_job',
    transaction,
    async (tx, event) => {
      await tx.query(
        `INSERT INTO notification_jobs_v2 (id, event_id, state, created_at, updated_at, data)
         VALUES ($1, $2, 'pending', $3, $3, $4)
         ON CONFLICT (event_id) DO NOTHING`,
        [`notification:${event.id}`, event.id, Date.now(), { dealRoomId: event.aggregateId }],
      );
    },
  );
}

export function createBrowserProjectionConsumer(
  transaction: TransactionRunner,
): TransactionalEventConsumer {
  return new TransactionalEventConsumer(
    'browser_projection',
    transaction,
    async (_tx, event) => {
      domainEventLiveBus.publish(event);
    },
  );
}

interface InMemoryOutboxRow {
  envelope: OutboxEnvelope;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  lastError?: string;
}

export class InMemoryOutboxStore implements OutboxStore {
  private readonly rows = new Map<string, InMemoryOutboxRow>();

  enqueue(event: DomainEventV2, availableAt = event.occurredAt): void {
    this.rows.set(`outbox:${event.id}`, {
      envelope: {
        id: `outbox:${event.id}`,
        eventId: event.id,
        state: 'pending',
        attempt: 0,
        availableAt,
        event,
      },
    });
  }

  inspect(eventId: string): OutboxEnvelope | null {
    return this.rows.get(`outbox:${eventId}`)?.envelope ?? null;
  }

  async claimDue(input: { workerId: string; now: number; leaseMs: number; limit: number }): Promise<OutboxEnvelope[]> {
    const due = [...this.rows.values()]
      .filter((row) =>
        ((row.envelope.state === 'pending' || row.envelope.state === 'retry') && row.envelope.availableAt <= input.now) ||
        (row.envelope.state === 'delivering' && (row.leaseExpiresAt ?? 0) <= input.now),
      )
      .sort((a, b) => a.envelope.availableAt - b.envelope.availableAt)
      .slice(0, input.limit);
    return due.map((row) => {
      row.envelope = { ...row.envelope, state: 'delivering', attempt: row.envelope.attempt + 1 };
      row.leaseOwner = input.workerId;
      row.leaseExpiresAt = input.now + input.leaseMs;
      return row.envelope;
    });
  }

  async markDelivered(id: string, workerId: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row || row.leaseOwner !== workerId) throw new Error(`outbox lease lost before delivery: ${id}`);
    row.envelope = { ...row.envelope, state: 'delivered' };
    delete row.leaseOwner;
    delete row.leaseExpiresAt;
  }

  async markFailed(input: { id: string; workerId: string; attempt: number; nextAvailableAt: number; error: string; deadLetter: boolean }): Promise<void> {
    const row = this.rows.get(input.id);
    if (!row || row.leaseOwner !== input.workerId || row.envelope.attempt !== input.attempt) {
      throw new Error(`outbox lease lost before failure update: ${input.id}`);
    }
    row.envelope = {
      ...row.envelope,
      state: input.deadLetter ? 'dead_letter' : 'retry',
      availableAt: input.nextAvailableAt,
    };
    row.lastError = input.error;
    delete row.leaseOwner;
    delete row.leaseExpiresAt;
  }
}

export class InMemoryIdempotentConsumer implements EventConsumer {
  readonly seen = new Set<string>();
  calls = 0;

  constructor(
    readonly name: string,
    private readonly handler: (event: DomainEventV2) => Promise<void> = async () => {},
  ) {}

  async consume(event: DomainEventV2): Promise<boolean> {
    if (this.seen.has(event.id)) return false;
    await this.handler(event);
    this.seen.add(event.id);
    this.calls += 1;
    return true;
  }
}
