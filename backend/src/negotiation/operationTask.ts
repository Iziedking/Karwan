import { z } from 'zod';
import type { AgentRuntimeRepository, RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore, EnqueueTaskInput } from '../agents/durableTaskRunner.js';
import { ensureShadowDealRoom } from '../agents/shadowDealRoom.js';
import {
  structuredOfferFingerprint,
  type NegotiationMandates,
  type StructuredOffer,
} from './structuredOffer.js';
import type { NegotiationAttemptStore, NegotiationTrigger } from './attempts.js';
import type { MandateSnapshotStore } from './mandates.js';
import { negotiationMandatesSchema } from './mandates.js';

export const NEGOTIATION_OPERATION_TASK = 'negotiation.turn.operation';

const triggerSchema = z.enum([
  'INITIAL_MATCH', 'NEW_OFFER', 'TERMS_CHANGED', 'MANDATE_CHANGED', 'STAKE_CONFIRMED',
  'FUNDS_CONFIRMED', 'EVIDENCE_IMPROVED', 'CAPACITY_AVAILABLE', 'COOLDOWN_ELAPSED',
  'DEADLINE_WINDOW', 'USER_REQUESTED',
] satisfies [NegotiationTrigger, ...NegotiationTrigger[]]);
const sourceSchema = z.enum(['manual-review', 'legacy-proposal', 'reengagement']);
const taskSchema = z.object({
  dealRoomId: z.string().min(1),
  source: sourceSchema,
  commandId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  expectedDealRoomVersion: z.number().int().positive(),
  rawOffer: z.record(z.unknown()),
  mandates: negotiationMandatesSchema,
  attempt: z.object({
    id: z.string().min(1),
    attemptNumber: z.number().int().positive(),
    trigger: triggerSchema,
    triggerReference: z.string().min(1),
    strategy: z.record(z.unknown()),
    priorOfferVersion: z.number().int().positive().optional(),
  }).strict(),
  observedAtUnix: z.number().int().nonnegative(),
}).strict();

export type NegotiationOperationTaskData = z.infer<typeof taskSchema>;

export function parseNegotiationOperationTask(input: unknown): NegotiationOperationTaskData {
  return taskSchema.parse(input);
}

export type NegotiationPublishResult =
  | { outcome: 'published'; offer: StructuredOffer; dealRoomVersion: number; supersededOfferId?: string }
  | { outcome: 'duplicate'; offer: StructuredOffer; dealRoomVersion: number }
  | { outcome: 'stale'; reason: 'STALE_DEAL_ROOM' | 'STALE_OFFER'; dealRoomVersion: number; activeOfferId?: string; activeOfferVersion?: number };

export interface NegotiationOperationExecutor {
  publishOffer(input: {
    commandId: string;
    idempotencyKey: string;
    expectedDealRoomVersion: number;
    rawOffer: unknown;
    mandates: NegotiationMandates;
    nowUnix: number;
  }): Promise<NegotiationPublishResult>;
}

export function createNegotiationOperationObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
  mandateStore?: MandateSnapshotStore,
): (data: NegotiationOperationTaskData) => Promise<{ created: boolean }> {
  return async (data) => {
    const parsed = parseNegotiationOperationTask(data);
    if (roomRepository) {
      await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.observedAtUnix, {
        buyerMandateVersion: parsed.mandates.buyerMandateVersion,
        sellerMandateVersion: parsed.mandates.sellerMandateVersion,
      });
    }
    if (mandateStore) {
      await mandateStore.put({
        dealRoomId: parsed.dealRoomId,
        role: 'BUYER',
        version: parsed.mandates.buyerMandateVersion,
        mandates: parsed.mandates,
        createdAt: parsed.observedAtUnix,
      });
      await mandateStore.put({
        dealRoomId: parsed.dealRoomId,
        role: 'SELLER',
        version: parsed.mandates.sellerMandateVersion,
        mandates: parsed.mandates,
        createdAt: parsed.observedAtUnix,
      });
    }
    const input: EnqueueTaskInput = {
      id: `task:negotiation:operation:${parsed.idempotencyKey}`,
      dealRoomId: parsed.dealRoomId,
      kind: NEGOTIATION_OPERATION_TASK,
      idempotencyKey: `negotiation-operation:${parsed.idempotencyKey}`,
      availableAt: parsed.observedAtUnix,
      maxAttempts: 3,
      data: parsed as unknown as RuntimeData,
      now: parsed.observedAtUnix,
    };
    const result = await taskStore.enqueue(input);
    return { created: result.created };
  };
}

export interface NegotiationOperationHandlerOptions {
  executor: NegotiationOperationExecutor;
  attempts: NegotiationAttemptStore;
  clock?: () => number;
}

/**
 * Durable reviewed negotiation seam. It persists attempt history before
 * invoking the deterministic offer runtime, and never calls an LLM/provider
 * or accepts/funds a deal by itself.
 */
export function createNegotiationOperationHandlers(
  options: NegotiationOperationHandlerOptions,
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [NEGOTIATION_OPERATION_TASK]: async (context) => {
      const input = parseNegotiationOperationTask(context.task.data);
      const now = options.clock?.() ?? Date.now();
      let attempt = await options.attempts.create({
        id: input.attempt.id,
        dealRoomId: input.dealRoomId,
        attemptNumber: input.attempt.attemptNumber,
        trigger: input.attempt.trigger,
        triggerReference: input.attempt.triggerReference,
        strategy: input.attempt.strategy,
        ...(input.attempt.priorOfferVersion === undefined ? {} : { priorOfferVersion: input.attempt.priorOfferVersion }),
        data: { source: input.source },
        now: input.observedAtUnix,
      });
      if (attempt.state === 'planned') {
        attempt = await options.attempts.update(attempt.id, attempt.version, 'running', { startedAtUnix: now }, now);
      }
      const result = await options.executor.publishOffer({
        commandId: input.commandId,
        idempotencyKey: input.idempotencyKey,
        expectedDealRoomVersion: input.expectedDealRoomVersion,
        rawOffer: input.rawOffer,
        mandates: input.mandates as NegotiationMandates,
        nowUnix: input.observedAtUnix,
      });
      const nextState = result.outcome === 'stale' ? 'temporary_impasse' : 'waiting';
      if (attempt.state === 'running') {
        attempt = await options.attempts.update(attempt.id, attempt.version, nextState, {
          outcome: result.outcome,
          ...(result.outcome === 'stale'
            ? { reason: result.reason, reentryCondition: 'material_trigger', resumable: true }
            : { offerFingerprint: structuredOfferFingerprint(result.offer), offerVersion: result.offer.offerVersion }),
        }, now);
      }
      await context.checkpoint({
        checkpointKey: 'negotiation-operation-result',
        phase: 'negotiation.turn',
        data: {
          mode: 'reviewed-negotiation-operation-seam',
          source: input.source,
          outcome: result.outcome,
          attemptId: attempt.id,
          attemptState: attempt.state,
          dealRoomVersion: result.dealRoomVersion,
          ...(result.outcome === 'stale'
            ? {
                reason: result.reason,
                reentryCondition: 'material_trigger',
                resumable: true,
                ...(result.activeOfferVersion === undefined ? {} : { activeOfferVersion: result.activeOfferVersion }),
              }
            : { offerId: result.offer.offerId, offerVersion: result.offer.offerVersion, fingerprint: structuredOfferFingerprint(result.offer) }),
          observedAtUnix: input.observedAtUnix,
          processedAtUnix: now,
          providerCallMade: false,
          financialMutation: false,
        },
      });
      return { state: 'succeeded' };
    },
  };
}
