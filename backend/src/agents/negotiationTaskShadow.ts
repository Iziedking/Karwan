import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore } from './durableTaskRunner.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { AgentRuntimeRepository } from '../db/agentRuntime.js';
import { ensureShadowDealRoom } from './shadowDealRoom.js';
import {
  clampStructuredOffer,
  structuredOfferFingerprint,
  type NegotiationMandates,
} from '../negotiation/structuredOffer.js';
import {
  MandateVersionConflictError,
  type MandateSnapshotStore,
} from '../negotiation/mandates.js';

export const NEGOTIATION_SHADOW_TASK = 'negotiation.turn.shadow';

const mandateSchema = z.object({
  buyerMaxPriceUsdc: z.string().min(1),
  sellerMinPriceUsdc: z.string().min(1),
  earliestDeadlineUnix: z.number().int().positive().optional(),
  latestDeadlineUnix: z.number().int().positive().optional(),
  buyerMandateVersion: z.number().int().positive(),
  sellerMandateVersion: z.number().int().positive(),
}).strict();

const taskSchema = z.object({
  dealRoomId: z.string().min(1),
  commandId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  expectedDealRoomVersion: z.number().int().positive(),
  rawOffer: z.record(z.unknown()),
  mandates: mandateSchema,
  observedAtUnix: z.number().int().nonnegative(),
  source: z.enum(['buyer-bids', 'listing-brief', 'legacy-proposal']),
}).strict();

export type NegotiationShadowTaskData = z.infer<typeof taskSchema>;

export interface NegotiationShadowObservation {
  data: NegotiationShadowTaskData;
}

export type NegotiationShadowObserver = (observation: NegotiationShadowObservation) => Promise<void>;

/**
 * Optional durable offer projection used by the shadow handler. The runtime
 * owns only V2 shadow rows; callers must keep legacy transport and authority
 * outside this interface.
 */
export interface NegotiationShadowOfferRuntime {
  publishOffer(input: {
    commandId: string;
    idempotencyKey: string;
    expectedDealRoomVersion: number;
    rawOffer: unknown;
    mandates: NegotiationMandates;
    nowUnix: number;
  }): Promise<{
    outcome: 'published' | 'duplicate' | 'stale';
    dealRoomVersion: number;
    offer?: { offerId: string; offerVersion: number };
    supersededOfferId?: string;
    reason?: string;
    activeOfferId?: string;
    activeOfferVersion?: number;
  }>;
}

export interface NegotiationShadowRecord {
  taskId: string;
  dealRoomId?: string;
  state: string;
  idempotencyKey: string;
  attempt: number;
  createdAt: number;
  updatedAt: number;
  checkpoint?: {
    phase: string;
    sequence: number;
    data: RuntimeData;
  };
}

export interface NegotiationShadowSummary {
  total: number;
  byState: Record<string, number>;
  checkpointed: number;
  rejected: number;
}

export interface NegotiationShadowAuditStore {
  summary(): Promise<NegotiationShadowSummary>;
  list(limit?: number): Promise<readonly NegotiationShadowRecord[]>;
}

interface TaskAuditRow extends Record<string, unknown> {
  task_id: string;
  deal_room_id: string | null;
  state: string;
  idempotency_key: string;
  attempt: number | string;
  created_at: number | string;
  updated_at: number | string;
  phase: string | null;
  sequence: number | string | null;
  checkpoint_data: RuntimeData | null;
}

function auditInteger(value: number | string | null, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe negotiation audit ${label}`);
  return parsed;
}

function auditRecord(row: TaskAuditRow): NegotiationShadowRecord {
  return {
    taskId: row.task_id,
    ...(row.deal_room_id ? { dealRoomId: row.deal_room_id } : {}),
    state: row.state,
    idempotencyKey: row.idempotency_key,
    attempt: auditInteger(row.attempt, 'attempt'),
    createdAt: auditInteger(row.created_at, 'created_at'),
    updatedAt: auditInteger(row.updated_at, 'updated_at'),
    ...(row.phase && row.sequence !== null && row.checkpoint_data
      ? { checkpoint: { phase: row.phase, sequence: auditInteger(row.sequence, 'sequence'), data: row.checkpoint_data } }
      : {}),
  };
}

export class PostgresNegotiationShadowAuditStore implements NegotiationShadowAuditStore {
  constructor(private readonly executor: SqlExecutor) {}

  async list(limit = 500): Promise<readonly NegotiationShadowRecord[]> {
    const result = await this.executor.query<TaskAuditRow>(
      `SELECT t.id AS task_id, t.deal_room_id, t.state, t.idempotency_key, t.attempt,
              t.created_at, t.updated_at, c.phase, c.sequence, c.data AS checkpoint_data
       FROM agent_tasks t
       LEFT JOIN LATERAL (
         SELECT phase, sequence, data
         FROM agent_task_checkpoints
         WHERE task_id = t.id
         ORDER BY sequence DESC
         LIMIT 1
       ) c ON TRUE
       WHERE t.kind = $1
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [NEGOTIATION_SHADOW_TASK, Math.max(1, Math.min(limit, 500))],
    );
    return result.rows.map(auditRecord);
  }

  async summary(): Promise<NegotiationShadowSummary> {
    const records = await this.list(500);
    const byState: Record<string, number> = {};
    for (const record of records) byState[record.state] = (byState[record.state] ?? 0) + 1;
    return {
      total: records.length,
      byState,
      checkpointed: records.filter((record) => !!record.checkpoint).length,
      rejected: records.filter((record) => record.checkpoint?.data.decision === 'rejected').length,
    };
  }
}

export class InMemoryNegotiationShadowAuditStore implements NegotiationShadowAuditStore {
  constructor(private readonly records: readonly NegotiationShadowRecord[]) {}
  async list(limit = 500): Promise<readonly NegotiationShadowRecord[]> { return this.records.slice(0, Math.max(1, Math.min(limit, 500))); }
  async summary(): Promise<NegotiationShadowSummary> {
    const records = await this.list(500);
    const byState: Record<string, number> = {};
    for (const record of records) byState[record.state] = (byState[record.state] ?? 0) + 1;
    return { total: records.length, byState, checkpointed: records.filter((record) => !!record.checkpoint).length, rejected: records.filter((record) => record.checkpoint?.data.decision === 'rejected').length };
  }
}

export function createNegotiationShadowObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
  mandateStore?: MandateSnapshotStore,
): NegotiationShadowObserver {
  return async ({ data }) => {
    const parsed = taskSchema.parse(data);
    if (roomRepository) {
      await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.observedAtUnix, {
        buyerMandateVersion: parsed.mandates.buyerMandateVersion,
        sellerMandateVersion: parsed.mandates.sellerMandateVersion,
      });
    }
    if (mandateStore) {
      try {
        await mandateStore.put({
          dealRoomId: parsed.dealRoomId,
          role: 'BUYER',
          version: parsed.mandates.buyerMandateVersion,
          mandates: parsed.mandates as NegotiationMandates,
          createdAt: parsed.observedAtUnix,
        });
        await mandateStore.put({
          dealRoomId: parsed.dealRoomId,
          role: 'SELLER',
          version: parsed.mandates.sellerMandateVersion,
          mandates: parsed.mandates as NegotiationMandates,
          createdAt: parsed.observedAtUnix,
        });
      } catch (error) {
        // Invalid shadow mandates remain auditable as rejected checkpoints;
        // an immutable version conflict is different and must not enqueue a
        // second interpretation of the same mandate version.
        if (error instanceof MandateVersionConflictError) throw error;
      }
    }
    await taskStore.enqueue({
      id: `task:negotiation:turn:${parsed.dealRoomId}:${parsed.rawOffer.offerId ?? parsed.commandId}`,
      dealRoomId: parsed.dealRoomId,
      kind: NEGOTIATION_SHADOW_TASK,
      idempotencyKey: parsed.idempotencyKey,
      availableAt: parsed.observedAtUnix,
      maxAttempts: 8,
      data: parsed as unknown as RuntimeData,
      now: parsed.observedAtUnix,
    });
  };
}

export function createNegotiationShadowHandlers(
  options: {
    clock?: () => number;
    offerRuntime?: NegotiationShadowOfferRuntime;
  } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [NEGOTIATION_SHADOW_TASK]: async (context) => {
      const input = taskSchema.parse(context.task.data);
      const now = options.clock?.() ?? Date.now();
      try {
        const clamped = clampStructuredOffer(input.rawOffer, input.mandates as NegotiationMandates);
        const projected = options.offerRuntime
          ? await options.offerRuntime.publishOffer({
              commandId: input.commandId,
              idempotencyKey: input.idempotencyKey,
              expectedDealRoomVersion: input.expectedDealRoomVersion,
              rawOffer: input.rawOffer,
              mandates: input.mandates as NegotiationMandates,
              nowUnix: input.observedAtUnix,
            })
          : undefined;
        await context.checkpoint({
          checkpointKey: 'shadow-decision',
          phase: 'negotiation.turn',
          data: {
            mode: 'read-only-shadow',
            source: input.source,
            expectedDealRoomVersion: input.expectedDealRoomVersion,
            offerVersion: clamped.offer.offerVersion,
            fingerprint: structuredOfferFingerprint(clamped.offer),
            changedFields: clamped.changedFields,
            reasons: clamped.reasons,
            ...(projected
              ? {
                  offerRuntime: {
                    outcome: projected.outcome,
                    dealRoomVersion: projected.dealRoomVersion,
                    ...(projected.offer ? {
                      offerId: projected.offer.offerId,
                      offerVersion: projected.offer.offerVersion,
                    } : {}),
                    ...(projected.supersededOfferId ? { supersededOfferId: projected.supersededOfferId } : {}),
                    ...(projected.reason ? { reason: projected.reason } : {}),
                    ...(projected.activeOfferId ? { activeOfferId: projected.activeOfferId } : {}),
                    ...(projected.activeOfferVersion === undefined ? {} : { activeOfferVersion: projected.activeOfferVersion }),
                  },
                }
              : {}),
            observedAtUnix: input.observedAtUnix,
            processedAtUnix: now,
          },
        });
      } catch (error) {
        await context.checkpoint({
          checkpointKey: 'shadow-decision',
          phase: 'negotiation.turn',
          data: {
            mode: 'read-only-shadow',
            source: input.source,
            decision: 'rejected',
            reason: 'STRUCTURED_OFFER_INVALID',
            error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
            observedAtUnix: input.observedAtUnix,
            processedAtUnix: now,
          },
        });
      }
      return { state: 'succeeded' };
    },
  };
}
