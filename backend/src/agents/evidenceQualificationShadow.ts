import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { AgentRuntimeRepository } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore } from './durableTaskRunner.js';
import { ensureShadowDealRoom } from './shadowDealRoom.js';
import {
  type EvidenceRuntimeRepository,
  type EvidencePurchaseState,
  type EvidenceSnapshotState,
} from '../evidence/runtime.js';

export const EVIDENCE_QUALIFICATION_SHADOW_TASK = 'evidence.qualification.shadow';

const needSchema = z.object({
  id: z.string().min(1),
  needKey: z.string().min(1),
  kind: z.string().min(1),
  riskClass: z.string().min(1),
  data: z.record(z.unknown()).default({}),
}).strict();

const purchaseSchema = z.object({
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  providerId: z.string().min(1),
  priceUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  observedState: z.enum(['unknown', 'reconciling']),
  providerTransactionId: z.string().min(1).optional(),
  data: z.record(z.unknown()).default({}),
}).strict();

const snapshotSchema = z.object({
  id: z.string().min(1),
  purchaseId: z.string().min(1).optional(),
  source: z.string().min(1),
  capturedAt: z.number().int().nonnegative(),
  reliability: z.number().int().min(0).max(100),
  state: z.enum(['fresh', 'stale', 'unknown', 'contradictory'] satisfies [EvidenceSnapshotState, ...EvidenceSnapshotState[]]),
  responseHash: z.string().min(1),
  provenance: z.array(z.string().min(1)).max(32),
}).strict();

const blockerSchema = z.object({
  id: z.string().min(1),
  blockerKey: z.string().min(1),
  kind: z.string().min(1),
  subject: z.string().min(1),
  data: z.record(z.unknown()).default({}),
}).strict();

const taskSchema = z.object({
  dealRoomId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  observedAtUnix: z.number().int().nonnegative(),
  source: z.enum(['matching-shadow', 'negotiation-shadow', 'manual-fixture']),
  need: needSchema,
  purchase: purchaseSchema.optional(),
  snapshot: snapshotSchema.optional(),
  blocker: blockerSchema.optional(),
}).strict();

export type EvidenceQualificationShadowTaskData = z.infer<typeof taskSchema>;

export interface EvidenceQualificationShadowObservation {
  data: EvidenceQualificationShadowTaskData;
}

export type EvidenceQualificationShadowObserver = (
  observation: EvidenceQualificationShadowObservation,
) => Promise<void>;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

function purchasePath(target: EvidencePurchaseState): readonly EvidencePurchaseState[] {
  if (target === 'unknown') return ['unknown'];
  if (target === 'reconciling') return ['submitted', 'reconciling'];
  return [];
}

export function createEvidenceQualificationShadowObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): EvidenceQualificationShadowObserver {
  return async ({ data }) => {
    const parsed = taskSchema.parse(data);
    if (roomRepository) {
      await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.observedAtUnix);
    }
    await taskStore.enqueue({
      id: `task:evidence:qualification:${parsed.dealRoomId}:${parsed.need.needKey}`,
      dealRoomId: parsed.dealRoomId,
      kind: EVIDENCE_QUALIFICATION_SHADOW_TASK,
      idempotencyKey: parsed.idempotencyKey,
      availableAt: parsed.observedAtUnix,
      maxAttempts: 8,
      data: parsed as unknown as RuntimeData,
      now: parsed.observedAtUnix,
    });
  };
}

export function createEvidenceQualificationShadowHandlers(
  repository: EvidenceRuntimeRepository,
  options: { clock?: () => number } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [EVIDENCE_QUALIFICATION_SHADOW_TASK]: async (context) => {
      const now = options.clock?.() ?? Date.now();
      try {
        const input = taskSchema.parse(context.task.data);
        const need = await repository.createNeed({
          id: input.need.id,
          dealRoomId: input.dealRoomId,
          needKey: input.need.needKey,
          kind: input.need.kind,
          riskClass: input.need.riskClass,
          data: input.need.data,
          now: input.observedAtUnix,
        });

        let purchaseState: EvidencePurchaseState | undefined;
        if (input.purchase) {
          const purchase = await repository.createPurchase({
            id: input.purchase.id,
            evidenceNeedId: need.record.id,
            idempotencyKey: input.purchase.idempotencyKey,
            providerId: input.purchase.providerId,
            priceUsdc: input.purchase.priceUsdc,
            data: input.purchase.data,
            now: input.observedAtUnix,
          });
          let current = purchase.record;
          for (const state of purchasePath(input.purchase.observedState)) {
            current = await repository.updatePurchase(current.id, current.version, state, {
              ...(input.purchase.providerTransactionId ? { providerTransactionId: input.purchase.providerTransactionId } : {}),
              now: input.observedAtUnix,
            });
          }
          purchaseState = current.state;
        }

        let snapshotState: EvidenceSnapshotState | undefined;
        if (input.snapshot) {
          const snapshot = await repository.recordSnapshot({
            id: input.snapshot.id,
            evidenceNeedId: need.record.id,
            ...(input.snapshot.purchaseId ? { purchaseId: input.snapshot.purchaseId } : input.purchase ? { purchaseId: input.purchase.id } : {}),
            source: input.snapshot.source,
            capturedAt: input.snapshot.capturedAt,
            reliability: input.snapshot.reliability,
            state: input.snapshot.state,
            responseHash: input.snapshot.responseHash,
            provenance: input.snapshot.provenance,
            now: input.observedAtUnix,
          });
          snapshotState = snapshot.record.state;
        }

        let blockerState: string | undefined;
        if (input.blocker) {
          const blocker = await repository.createBlocker({
            id: input.blocker.id,
            dealRoomId: input.dealRoomId,
            blockerKey: input.blocker.blockerKey,
            kind: input.blocker.kind,
            subject: input.blocker.subject,
            data: input.blocker.data,
            now: input.observedAtUnix,
          });
          blockerState = blocker.record.state;
        }

        await context.checkpoint({
          checkpointKey: 'shadow-observation',
          phase: 'candidate.evaluated',
          data: {
            mode: 'read-only-shadow',
            decision: 'observed',
            source: input.source,
            evidenceNeedId: need.record.id,
            evidenceNeedState: need.record.state,
            ...(purchaseState ? { purchaseState } : {}),
            ...(snapshotState ? { snapshotState } : {}),
            ...(blockerState ? { blockerState } : {}),
            observedAtUnix: input.observedAtUnix,
            processedAtUnix: now,
            providerCallMade: false,
            financialMutation: false,
          },
        });
      } catch (error) {
        await context.checkpoint({
          checkpointKey: 'shadow-observation',
          phase: 'candidate.evaluated',
          data: {
            mode: 'read-only-shadow',
            decision: 'rejected',
            reason: 'EVIDENCE_QUALIFICATION_INVALID',
            error: errorText(error),
            processedAtUnix: now,
            providerCallMade: false,
            financialMutation: false,
          },
        });
      }
      return { state: 'succeeded' };
    },
  };
}
