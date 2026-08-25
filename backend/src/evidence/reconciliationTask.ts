import { z } from 'zod';
import type { AgentRuntimeRepository, RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore, EnqueueTaskInput } from '../agents/durableTaskRunner.js';
import { ensureShadowDealRoom } from '../agents/shadowDealRoom.js';
import type {
  EvidenceRuntimeRepository,
  EvidencePurchaseRecord,
  EvidenceSnapshotState,
} from './runtime.js';
import type { ResearchCreditStore } from './researchCredit.js';

export const EVIDENCE_RECONCILIATION_OPERATION_TASK = 'evidence.reconcile.operation';

const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/i);
const snapshotSchema = z.object({
  snapshotId: z.string().min(1),
  source: z.string().min(1),
  capturedAtUnix: z.number().int().nonnegative(),
  reliability: z.number().int().min(0).max(100),
  status: z.enum(['fresh', 'stale', 'unknown', 'contradictory'] satisfies [EvidenceSnapshotState, ...EvidenceSnapshotState[]]),
  responseHash: z.string().min(1),
  provenance: z.array(z.string().min(1)).max(32),
}).strict();

const taskSchema = z.object({
  dealRoomId: z.string().min(1),
  purchaseId: z.string().min(1),
  expectedPurchaseVersion: z.number().int().positive(),
  observationKey: z.string().trim().min(1).max(200),
  observedAtUnix: z.number().int().nonnegative(),
  source: z.enum(['provider-webhook', 'manual-reconciliation']),
  verificationReference: z.string().trim().min(1).max(300),
  state: z.enum(['unknown', 'reconciling', 'settled', 'failed']),
  providerTransactionId: z.string().trim().min(1).optional(),
  txHash: z.string().trim().min(1).optional(),
  failureCode: z.string().trim().min(1).max(200).optional(),
  snapshot: snapshotSchema.optional(),
  researchCreditOwner: addressSchema.optional(),
  researchCreditReservationKey: z.string().trim().min(1).max(300).optional(),
}).strict().superRefine((value, context) => {
  if (value.state === 'settled' && !value.txHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['txHash'], message: 'settled evidence requires txHash' });
  }
  if (value.state === 'settled' && !value.providerTransactionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['providerTransactionId'], message: 'settled evidence requires providerTransactionId' });
  }
  if (value.snapshot && value.snapshot.status === 'fresh' && value.state !== 'settled') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['snapshot', 'status'], message: 'fresh snapshot requires settled evidence' });
  }
});

export type EvidenceReconciliationOperationTaskData = z.infer<typeof taskSchema>;

export function parseEvidenceReconciliationOperationTask(input: unknown): EvidenceReconciliationOperationTaskData {
  return taskSchema.parse(input);
}

export function createEvidenceReconciliationOperationObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): (data: EvidenceReconciliationOperationTaskData) => Promise<{ created: boolean }> {
  return async (data) => {
    const parsed = parseEvidenceReconciliationOperationTask(data);
    if (roomRepository) {
      await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.observedAtUnix);
    }
    const input: EnqueueTaskInput = {
      id: `task:evidence:reconcile:${parsed.purchaseId}:${parsed.observationKey}`,
      dealRoomId: parsed.dealRoomId,
      kind: EVIDENCE_RECONCILIATION_OPERATION_TASK,
      idempotencyKey: `evidence-reconciliation:${parsed.purchaseId}:${parsed.observationKey}`,
      availableAt: parsed.observedAtUnix,
      maxAttempts: 3,
      data: parsed as unknown as RuntimeData,
      now: parsed.observedAtUnix,
    };
    const result = await taskStore.enqueue(input);
    return { created: result.created };
  };
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

function snapshotRecord(
  snapshot: EvidenceReconciliationOperationTaskData['snapshot'],
  purchase: EvidencePurchaseRecord,
): Omit<Parameters<EvidenceRuntimeRepository['recordSnapshot']>[0], 'now'> {
  if (!snapshot) throw new Error('evidence snapshot is required');
  return {
    id: snapshot.snapshotId,
    evidenceNeedId: purchase.evidenceNeedId,
    purchaseId: purchase.id,
    source: snapshot.source,
    capturedAt: snapshot.capturedAtUnix,
    reliability: snapshot.reliability,
    state: snapshot.status,
    responseHash: snapshot.responseHash,
    provenance: snapshot.provenance,
  };
}

async function settleResearchCredit(
  purchase: EvidencePurchaseRecord,
  input: EvidenceReconciliationOperationTaskData,
  researchCredits: ResearchCreditStore | undefined,
): Promise<string | undefined> {
  if (!researchCredits || (input.state !== 'settled' && input.state !== 'failed')) return undefined;
  const data = purchase.data as Record<string, unknown>;
  const reservationKey = input.researchCreditReservationKey
    ?? (typeof data.researchCreditReservationKey === 'string' ? data.researchCreditReservationKey : undefined);
  if (!reservationKey) return undefined;
  const owner = input.researchCreditOwner
    ?? (typeof data.researchCreditOwner === 'string' ? data.researchCreditOwner : undefined);
  if (!owner) throw new Error('RESEARCH_CREDIT_OWNER_MISSING');
  const reservation = await researchCredits.getReservation(reservationKey);
  if (!reservation || reservation.state !== 'reserved') return reservation?.state;
  if (input.state === 'settled') {
    const result = await researchCredits.settle({
      reservationKey,
      expectedVersion: reservation.version,
      spentUsdc: purchase.priceUsdc,
      now: input.observedAtUnix,
    });
    return result.reservation.state;
  }
  const result = await researchCredits.release({
    reservationKey,
    expectedVersion: reservation.version,
    now: input.observedAtUnix,
  });
  return result.reservation.state;
}

async function recordSnapshotAndFulfill(
  repository: EvidenceRuntimeRepository,
  purchase: EvidencePurchaseRecord,
  input: EvidenceReconciliationOperationTaskData,
): Promise<string | undefined> {
  if (!input.snapshot) return undefined;
  const snapshot = await repository.recordSnapshot({
    ...snapshotRecord(input.snapshot, purchase),
    now: input.observedAtUnix,
  });
  const need = await repository.getNeed(purchase.evidenceNeedId);
  if (need && purchase.state === 'settled' && snapshot.record.state === 'fresh' && need.state === 'open') {
    await repository.updateNeed(need.id, need.version, 'fulfilled', {
      fulfilledBySnapshotId: snapshot.record.id,
    }, input.observedAtUnix);
  }
  return snapshot.record.state;
}

function duplicateObservationMatches(
  purchase: EvidencePurchaseRecord,
  input: EvidenceReconciliationOperationTaskData,
): boolean {
  const data = purchase.data as Record<string, unknown>;
  return purchase.state === input.state
    && data.reconciliationSource === input.source
    && data.verificationReference === input.verificationReference
    && (!input.providerTransactionId || purchase.providerTransactionId === input.providerTransactionId)
    && (!input.txHash || purchase.txHash === input.txHash)
    && (!input.researchCreditOwner || data.researchCreditOwner === input.researchCreditOwner)
    && (!input.researchCreditReservationKey || data.researchCreditReservationKey === input.researchCreditReservationKey);
}

export interface EvidenceReconciliationOperationHandlerOptions {
  repository: EvidenceRuntimeRepository;
  researchCredits?: ResearchCreditStore;
  clock?: () => number;
}

export function createEvidenceReconciliationOperationHandlers(
  options: EvidenceReconciliationOperationHandlerOptions,
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [EVIDENCE_RECONCILIATION_OPERATION_TASK]: async (context) => {
      const processedAtUnix = options.clock?.() ?? Date.now();
      let input: EvidenceReconciliationOperationTaskData;
      try {
        input = parseEvidenceReconciliationOperationTask(context.task.data);
      } catch (error) {
        await context.checkpoint({
          checkpointKey: 'evidence-reconciliation-result',
          phase: 'external.reconciled',
          data: {
            mode: 'reviewed-evidence-reconciliation',
            decision: 'rejected',
            reason: 'EVIDENCE_RECONCILIATION_INVALID',
            error: errorText(error),
            providerCallMade: false,
            financialMutation: false,
            processedAtUnix,
          },
        });
        return { state: 'succeeded' };
      }

      try {
        const purchase = await options.repository.getPurchase(input.purchaseId);
        if (!purchase) {
          await context.checkpoint({
            checkpointKey: 'evidence-reconciliation-result',
            phase: 'external.reconciled',
            data: {
              mode: 'reviewed-evidence-reconciliation',
              decision: 'rejected',
              reason: 'EVIDENCE_PURCHASE_NOT_FOUND',
              observationKey: input.observationKey,
              providerCallMade: false,
              financialMutation: false,
              processedAtUnix,
            },
          });
          return { state: 'succeeded' };
        }
        const existingObservation = (purchase.data as Record<string, unknown>).reconciliationObservationKey;
        if (existingObservation === input.observationKey) {
          if (!duplicateObservationMatches(purchase, input)) {
            await context.checkpoint({
              checkpointKey: 'evidence-reconciliation-result',
              phase: 'external.reconciled',
              data: {
                mode: 'reviewed-evidence-reconciliation',
                decision: 'rejected',
                reason: 'EVIDENCE_RECONCILIATION_CONFLICT',
                observationKey: input.observationKey,
                purchaseState: purchase.state,
                providerCallMade: false,
                financialMutation: false,
                processedAtUnix,
              },
            });
            return { state: 'succeeded' };
          }
          const snapshotState = await recordSnapshotAndFulfill(options.repository, purchase, input);
          const creditState = await settleResearchCredit(purchase, input, options.researchCredits);
          await context.checkpoint({
            checkpointKey: 'evidence-reconciliation-result',
            phase: 'external.reconciled',
            data: {
              mode: 'reviewed-evidence-reconciliation',
              decision: 'duplicate',
              observationKey: input.observationKey,
              purchaseState: purchase.state,
              ...(snapshotState ? { snapshotState } : {}),
              ...(creditState ? { researchCreditReservationState: creditState } : {}),
              providerCallMade: false,
              financialMutation: false,
              processedAtUnix,
            },
          });
          return { state: 'succeeded' };
        }
        if (purchase.version !== input.expectedPurchaseVersion) {
          await context.checkpoint({
            checkpointKey: 'evidence-reconciliation-result',
            phase: 'external.reconciled',
            data: {
              mode: 'reviewed-evidence-reconciliation',
              decision: 'rejected',
              reason: 'EVIDENCE_PURCHASE_VERSION_STALE',
              observationKey: input.observationKey,
              currentPurchaseVersion: purchase.version,
              expectedPurchaseVersion: input.expectedPurchaseVersion,
              providerCallMade: false,
              financialMutation: false,
              processedAtUnix,
            },
          });
          return { state: 'succeeded' };
        }
        const next = await options.repository.updatePurchase(
          purchase.id,
          purchase.version,
          input.state,
          {
            ...(input.providerTransactionId ? { providerTransactionId: input.providerTransactionId } : {}),
            ...(input.txHash ? { txHash: input.txHash } : {}),
            data: {
              reconciliationObservationKey: input.observationKey,
              reconciliationSource: input.source,
              verificationReference: input.verificationReference,
              ...(input.failureCode ? { failureCode: input.failureCode } : {}),
              ...(input.researchCreditOwner ? { researchCreditOwner: input.researchCreditOwner } : {}),
              ...(input.researchCreditReservationKey ? { researchCreditReservationKey: input.researchCreditReservationKey } : {}),
            },
            now: input.observedAtUnix,
          },
        );
        const snapshotState = await recordSnapshotAndFulfill(options.repository, next, input);
        const creditState = await settleResearchCredit(purchase, input, options.researchCredits);
        await context.checkpoint({
          checkpointKey: 'evidence-reconciliation-result',
          phase: 'external.reconciled',
          data: {
            mode: 'reviewed-evidence-reconciliation',
            decision: 'observed',
            source: input.source,
            verificationReference: input.verificationReference,
            observationKey: input.observationKey,
            purchaseState: next.state,
            ...(snapshotState ? { snapshotState } : {}),
            ...(creditState ? { researchCreditReservationState: creditState } : {}),
            providerCallMade: false,
            financialMutation: false,
            processedAtUnix,
          },
        });
      } catch (error) {
        await context.checkpoint({
          checkpointKey: `evidence-reconciliation-retry-${context.task.attempt}`,
          phase: 'external.reconciled',
          data: {
            mode: 'reviewed-evidence-reconciliation',
            decision: 'retrying',
            reason: 'EVIDENCE_RECONCILIATION_RETRYABLE',
            error: errorText(error),
            providerCallMade: false,
            financialMutation: false,
            processedAtUnix,
          },
        });
        throw error;
      }
      return { state: 'succeeded' };
    },
  };
}
