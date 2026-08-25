import { z } from 'zod';
import type { AgentRuntimeRepository, RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore } from './durableTaskRunner.js';
import { ensureShadowDealRoom } from './shadowDealRoom.js';
import {
  type EvidencePurchaseState,
  type EvidenceRuntimeRepository,
  type EvidenceSnapshotState,
} from '../evidence/runtime.js';
import {
  evidenceNeedKey,
  planEvidenceAcquisition,
  type EvidenceClaim,
  type EvidenceProvider,
  type EvidenceSnapshot,
} from '../evidence/planner.js';
import {
  selectRegisteredProvider,
  type EvidenceProviderRegistration,
} from '../evidence/providerRegistry.js';

export const EVIDENCE_ACQUISITION_SHADOW_TASK = 'evidence.acquisition.shadow';

const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/i);
const claimSchema = z.enum([
  'completed-transactions',
  'completion-quality',
  'counterparty-concentration',
  'skill-attestation',
  'capacity',
  'market-benchmark',
] satisfies [EvidenceClaim, ...EvidenceClaim[]]);
const sourceSchema = z.enum(['karwan-state', 'onchain', 'fresh-cache', 'free-provider', 'x402', 'corroboration']);
const decisionSchema = z.enum(['eligibility', 'ranking', 'qualification', 'negotiation']);
const snapshotStateSchema = z.enum(['fresh', 'stale', 'unknown', 'contradictory'] satisfies [EvidenceSnapshotState, ...EvidenceSnapshotState[]]);

const needSchema = z.object({
  needId: z.string().min(1),
  claim: claimSchema,
  subject: z.string().min(1),
  decision: decisionSchema,
  requiredFreshnessSeconds: z.number().int().positive(),
  minimumReliability: z.number().int().min(0).max(100),
  maximumPriceUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  mandateVersion: z.number().int().positive(),
  policyVersion: z.string().min(1),
  expiresAtUnix: z.number().int().nonnegative(),
}).strict();

const snapshotSchema = z.object({
  snapshotId: z.string().min(1),
  needId: z.string().min(1),
  source: sourceSchema,
  capturedAtUnix: z.number().int().nonnegative(),
  reliability: z.number().int().min(0).max(100),
  status: snapshotStateSchema,
  provenance: z.array(z.string().min(1)).max(32),
  responseHash: z.string().min(1),
}).strict();

const providerSchema = z.object({
  providerId: z.string().min(1),
  source: z.enum(['free-provider', 'x402']),
  endpoint: z.string().url(),
  network: z.string().min(1),
  asset: z.string().min(1),
  payTo: addressSchema.optional(),
  priceUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  expectedReliability: z.number().int().min(0).max(100),
  responseLimitBytes: z.number().int().positive().max(1_000_000),
  providerVersion: z.string().min(1),
  claims: z.array(claimSchema).max(20),
  provenanceRequirements: z.array(z.string().min(1)).max(32),
  enabled: z.boolean(),
  circuit: z.object({
    state: z.enum(['closed', 'open', 'half_open']),
    consecutiveFailures: z.number().int().nonnegative(),
    openedAtUnix: z.number().int().nonnegative().optional(),
    cooldownSeconds: z.number().int().positive(),
    failureThreshold: z.number().int().positive(),
  }).strict(),
}).strict();

const providerObservationSchema = z.object({
  state: z.enum(['submitted', 'unknown', 'reconciling', 'settled', 'failed']),
  providerTransactionId: z.string().min(1).optional(),
  txHash: z.string().min(1).optional(),
  failureCode: z.string().min(1).optional(),
  snapshot: snapshotSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.state === 'settled' && !value.txHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['txHash'], message: 'settled evidence requires txHash' });
  }
});

const plannerInputSchema = z.object({
  need: needSchema,
  nowUnix: z.number().int().nonnegative(),
  directSnapshot: snapshotSchema.optional(),
  cachedSnapshots: z.array(snapshotSchema).max(100),
  providers: z.array(providerSchema).max(50),
  expectedDecisionValueUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  perDealSpentUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  perDealBudgetUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  allowedNetworks: z.array(z.string().min(1)).max(50),
  allowedAssets: z.array(z.string().min(1)).max(50),
  allowedPayTo: z.array(addressSchema).max(100),
  requiredProvenance: z.array(z.string().min(1)).max(32).default([]),
}).strict();

const taskSchema = z.object({
  dealRoomId: z.string().min(1),
  source: z.enum(['matching-shadow', 'negotiation-shadow', 'research-scout-shadow', 'manual-fixture']),
  idempotencyKey: z.string().min(1),
  planner: plannerInputSchema,
  providerObservation: providerObservationSchema.optional(),
}).strict();

export type EvidenceAcquisitionShadowTaskData = z.infer<typeof taskSchema>;

export interface EvidenceAcquisitionShadowObservation {
  data: EvidenceAcquisitionShadowTaskData;
}

export type EvidenceAcquisitionShadowObserver = (
  observation: EvidenceAcquisitionShadowObservation,
) => Promise<void>;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

function purchasePath(target: EvidencePurchaseState): readonly EvidencePurchaseState[] {
  if (target === 'submitted') return ['submitted'];
  if (target === 'unknown') return ['unknown'];
  if (target === 'reconciling') return ['submitted', 'reconciling'];
  if (target === 'settled') return ['submitted', 'settled'];
  if (target === 'failed') return ['failed'];
  return [];
}

function snapshotRecord(snapshot: EvidenceSnapshot, evidenceNeedId: string, purchaseId?: string) {
  return {
    id: snapshot.snapshotId,
    evidenceNeedId,
    ...(purchaseId ? { purchaseId } : {}),
    source: snapshot.source,
    capturedAt: snapshot.capturedAtUnix,
    reliability: snapshot.reliability,
    state: snapshot.status,
    responseHash: snapshot.responseHash,
    provenance: snapshot.provenance,
  };
}

function providerRuntimeData(provider: EvidenceProviderRegistration): RuntimeData {
  return {
    providerVersion: provider.providerVersion,
    providerSource: provider.source,
    endpoint: provider.endpoint,
    network: provider.network,
    asset: provider.asset,
    claims: provider.claims,
    provenanceRequirements: provider.provenanceRequirements,
  };
}

export function createEvidenceAcquisitionShadowObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): EvidenceAcquisitionShadowObserver {
  return async ({ data }) => {
    const parsed = taskSchema.parse(data);
    if (roomRepository) {
      await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.planner.nowUnix);
    }
    await taskStore.enqueue({
      id: `task:evidence:acquisition:${parsed.dealRoomId}:${evidenceNeedKey(parsed.planner.need)}`,
      dealRoomId: parsed.dealRoomId,
      kind: EVIDENCE_ACQUISITION_SHADOW_TASK,
      idempotencyKey: parsed.idempotencyKey,
      availableAt: parsed.planner.nowUnix,
      maxAttempts: 8,
      data: parsed as unknown as RuntimeData,
      now: parsed.planner.nowUnix,
    });
  };
}

export function createEvidenceAcquisitionShadowHandlers(
  repository: EvidenceRuntimeRepository,
  options: { clock?: () => number } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [EVIDENCE_ACQUISITION_SHADOW_TASK]: async (context) => {
      const processedAtUnix = options.clock?.() ?? Date.now();
      try {
        const input = taskSchema.parse(context.task.data);
        const planner = input.planner;
        const selectedProviders = planner.providers.filter((provider) => {
          const registration = provider as EvidenceProviderRegistration;
          return selectRegisteredProvider(registration, planner.need, planner.nowUnix, planner.requiredProvenance).allowed;
        });
        const decision = planEvidenceAcquisition({
          ...planner,
          providers: selectedProviders as readonly EvidenceProvider[],
        });
        const need = await repository.createNeed({
          id: `need:${evidenceNeedKey(planner.need)}`,
          dealRoomId: input.dealRoomId,
          needKey: evidenceNeedKey(planner.need),
          kind: planner.need.claim,
          riskClass: planner.need.decision,
          data: {
            subject: planner.need.subject,
            mandateVersion: planner.need.mandateVersion,
            policyVersion: planner.need.policyVersion,
            expiresAtUnix: planner.need.expiresAtUnix,
          },
          now: planner.nowUnix,
        });

        let purchaseState: EvidencePurchaseState | undefined;
        let snapshotState: EvidenceSnapshotState | undefined;
        let purchaseId: string | undefined;
        // Legacy market research has already paid before this shadow task is
        // observed. Preserve that payment as an UNKNOWN durable purchase so
        // the audit trail contains a payment record and a linked snapshot,
        // without inventing provider settlement or making another call.
        const legacyPaymentObserved = planner.directSnapshot?.source === 'x402'
          && Number(planner.perDealSpentUsdc) > 0;
        if (legacyPaymentObserved) {
          const legacyPurchaseKey = `legacy-observed-payment:${evidenceNeedKey(planner.need)}`;
          const purchase = await repository.createPurchase({
            id: `purchase:${evidenceNeedKey(planner.need)}:legacy-observed`,
            evidenceNeedId: need.record.id,
            idempotencyKey: legacyPurchaseKey,
            providerId: 'legacy-market-research',
            priceUsdc: planner.perDealSpentUsdc,
            data: {
              mode: 'read-only-shadow',
              source: input.source,
              paymentState: 'observed-before-shadow',
              provenance: planner.directSnapshot?.provenance ?? [],
            },
            now: planner.nowUnix,
          });
          let observedPurchase = purchase.record;
          if (observedPurchase.state === 'created') {
            observedPurchase = await repository.updatePurchase(
              observedPurchase.id,
              observedPurchase.version,
              'unknown',
              { now: planner.nowUnix },
            );
          }
          purchaseId = observedPurchase.id;
          purchaseState = observedPurchase.state;
        }
        // Preserve an already-observed but unusable snapshot as evidence
        // history too. In particular, an UNKNOWN legacy payment must remain
        // visible even when the planner correctly decides to wait instead of
        // purchasing again.
        if (planner.directSnapshot) {
          const snapshot = await repository.recordSnapshot({
            ...snapshotRecord(planner.directSnapshot, need.record.id, purchaseId),
            now: planner.nowUnix,
          });
          snapshotState = snapshot.record.state;
        }
        if (decision.action === 'use') {
          if (!planner.directSnapshot || planner.directSnapshot.responseHash !== decision.snapshot.responseHash) {
            const snapshot = await repository.recordSnapshot({
              ...snapshotRecord(decision.snapshot, need.record.id),
              now: planner.nowUnix,
            });
            snapshotState = snapshot.record.state;
          }
          await repository.updateNeed(need.record.id, need.record.version, 'fulfilled', {
            fulfilledBySnapshotId: decision.snapshot.snapshotId,
          }, planner.nowUnix);
        } else if (decision.action === 'purchase') {
          const provider = decision.provider as EvidenceProviderRegistration;
          const purchaseKey = `evidence:${evidenceNeedKey(planner.need)}:${provider.providerId}`;
          const purchase = await repository.createPurchase({
            id: `purchase:${evidenceNeedKey(planner.need)}:${provider.providerId}`,
            evidenceNeedId: need.record.id,
            idempotencyKey: purchaseKey,
            providerId: provider.providerId,
            priceUsdc: provider.priceUsdc,
            data: {
              mode: 'read-only-shadow',
              reason: decision.reason,
              ...providerRuntimeData(provider),
            },
            now: planner.nowUnix,
          });
          let current = purchase.record;
          if (input.providerObservation) {
            const target = input.providerObservation.state as EvidencePurchaseState;
            for (const state of purchasePath(target)) {
              current = await repository.updatePurchase(current.id, current.version, state, {
                ...(input.providerObservation.providerTransactionId ? { providerTransactionId: input.providerObservation.providerTransactionId } : {}),
                ...(input.providerObservation.txHash ? { txHash: input.providerObservation.txHash } : {}),
                ...(input.providerObservation.failureCode ? { data: { failureCode: input.providerObservation.failureCode } } : {}),
                now: planner.nowUnix,
              });
            }
            if (input.providerObservation.snapshot) {
              const snapshot = await repository.recordSnapshot({
                ...snapshotRecord(input.providerObservation.snapshot, need.record.id, current.id),
                now: planner.nowUnix,
              });
              snapshotState = snapshot.record.state;
              if (current.state === 'settled' && snapshot.record.state === 'fresh') {
                await repository.updateNeed(need.record.id, need.record.version, 'fulfilled', {
                  fulfilledBySnapshotId: snapshot.record.id,
                }, planner.nowUnix);
              }
            }
          }
          purchaseState = current.state;
          purchaseId = current.id;
        }

        await context.checkpoint({
          checkpointKey: 'shadow-acquisition-decision',
          phase: 'candidate.evaluated',
          data: {
            mode: 'read-only-shadow',
            source: input.source,
            decision: decision.action,
            reason: decision.action === 'wait' ? decision.reason : decision.reason,
            evidenceNeedId: need.record.id,
            evidenceNeedState: need.record.state,
            ...(purchaseId ? { purchaseId } : {}),
            ...(purchaseState ? { purchaseState } : {}),
            ...(snapshotState ? { snapshotState } : {}),
            providerCallMade: false,
            financialMutation: false,
            processedAtUnix,
          },
        });
      } catch (error) {
        await context.checkpoint({
          checkpointKey: 'shadow-acquisition-decision',
          phase: 'candidate.evaluated',
          data: {
            mode: 'read-only-shadow',
            decision: 'rejected',
            reason: 'EVIDENCE_ACQUISITION_INVALID',
            error: errorText(error),
            providerCallMade: false,
            financialMutation: false,
            processedAtUnix,
          },
        });
      }
      return { state: 'succeeded' };
    },
  };
}
