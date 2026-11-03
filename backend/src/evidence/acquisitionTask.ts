import { z } from 'zod';
import type { AgentRuntimeRepository, RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore, EnqueueTaskInput } from '../agents/durableTaskRunner.js';
import { ensureShadowDealRoom } from '../agents/shadowDealRoom.js';
import {
  evidenceNeedKey,
  planEvidenceAcquisition,
  type EvidenceClaim,
  type EvidenceNeed,
  type EvidenceProvider,
  type EvidenceSnapshot,
} from './planner.js';
import {
  selectRegisteredProvider,
  type EvidenceProviderRegistration,
} from './providerRegistry.js';
import type { EvidencePurchaseState, EvidenceRuntimeRepository, EvidenceSnapshotState } from './runtime.js';
import type { DataBudget } from '../x402/dataGate.js';
import { recordEvidenceSpend } from './budgetSpend.js';

export const EVIDENCE_ACQUISITION_OPERATION_TASK = 'evidence.acquisition.operation';

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

const plannerSchema = z.object({
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
  source: z.enum(['manual-review', 'negotiation-resume', 'matching-review']),
  idempotencyKey: z.string().min(1),
  budgetOwner: addressSchema.optional(),
  planner: plannerSchema,
}).strict();

const providerResultSchema = z.object({
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

export type EvidenceAcquisitionOperationTaskData = z.infer<typeof taskSchema>;

export function parseEvidenceAcquisitionOperationTask(input: unknown): EvidenceAcquisitionOperationTaskData {
  return taskSchema.parse(input);
}

export interface EvidenceAcquisitionAdapter {
  acquire(input: {
    provider: EvidenceProviderRegistration;
    need: EvidenceNeed;
    idempotencyKey: string;
    nowUnix: number;
  }): Promise<z.infer<typeof providerResultSchema>>;
}

export function createEvidenceAcquisitionOperationObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): (data: EvidenceAcquisitionOperationTaskData) => Promise<{ created: boolean }> {
  return async (data) => {
    const parsed = parseEvidenceAcquisitionOperationTask(data);
    if (roomRepository) await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.planner.nowUnix);
    const input: EnqueueTaskInput = {
      id: `task:evidence:operation:${parsed.idempotencyKey}`,
      dealRoomId: parsed.dealRoomId,
      kind: EVIDENCE_ACQUISITION_OPERATION_TASK,
      idempotencyKey: `evidence-operation:${parsed.idempotencyKey}`,
      availableAt: parsed.planner.nowUnix,
      maxAttempts: 3,
      data: parsed as unknown as RuntimeData,
      now: parsed.planner.nowUnix,
    };
    const result = await taskStore.enqueue(input);
    return { created: result.created };
  };
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

function providerData(provider: EvidenceProviderRegistration): RuntimeData {
  return {
    mode: 'reviewed-evidence-operation-seam',
    providerVersion: provider.providerVersion,
    providerSource: provider.source,
    endpoint: provider.endpoint,
    network: provider.network,
    asset: provider.asset,
    claims: provider.claims,
    provenanceRequirements: provider.provenanceRequirements,
  };
}

export interface EvidenceAcquisitionOperationHandlerOptions {
  repository: EvidenceRuntimeRepository;
  adapter: EvidenceAcquisitionAdapter;
  /**
   * The person's weekly data budget (view 48, step 6), the one budget every
   * paid read goes through. When supplied with a task owner, an x402 purchase
   * is checked against it before any adapter call and its price is recorded
   * once the purchase settles.
   */
  budget?: DataBudget;
  clock?: () => number;
}

/**
 * Builds a reviewed acquisition handler around an injected provider adapter.
 * It is intentionally not registered by the application boot path: callers
 * must explicitly opt into this seam and supply the external adapter.
 */
export function createEvidenceAcquisitionOperationHandlers(
  options: EvidenceAcquisitionOperationHandlerOptions,
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [EVIDENCE_ACQUISITION_OPERATION_TASK]: async (context) => {
      const processedAtUnix = options.clock?.() ?? Date.now();
      const input = parseEvidenceAcquisitionOperationTask(context.task.data);
      const planner = input.planner;
      const registeredProviders = planner.providers
        .map((provider) => provider as EvidenceProviderRegistration)
        .filter((provider) => selectRegisteredProvider(
          provider,
          planner.need as EvidenceNeed,
          planner.nowUnix,
          planner.requiredProvenance,
        ).allowed);
      const decision = planEvidenceAcquisition({
        ...planner,
        need: planner.need as EvidenceNeed,
        directSnapshot: planner.directSnapshot as EvidenceSnapshot | undefined,
        cachedSnapshots: planner.cachedSnapshots as readonly EvidenceSnapshot[],
        providers: registeredProviders as readonly EvidenceProvider[],
      });
      const need = await options.repository.createNeed({
        id: `need:${evidenceNeedKey(planner.need as EvidenceNeed)}`,
        dealRoomId: input.dealRoomId,
        needKey: evidenceNeedKey(planner.need as EvidenceNeed),
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
      let providerCallMade = false;
      let financialMutation = false;
      let failureCode: string | undefined;
      let budgetOwner: string | undefined;

      if (planner.directSnapshot) {
        const snapshot = await options.repository.recordSnapshot({
          ...snapshotRecord(planner.directSnapshot as EvidenceSnapshot, need.record.id),
          now: planner.nowUnix,
        });
        snapshotState = snapshot.record.state;
      }

      if (decision.action === 'use') {
        if (!planner.directSnapshot || planner.directSnapshot.responseHash !== decision.snapshot.responseHash) {
          const snapshot = await options.repository.recordSnapshot({
            ...snapshotRecord(decision.snapshot, need.record.id),
            now: planner.nowUnix,
          });
          snapshotState = snapshot.record.state;
        }
        if (need.record.state === 'open') {
          await options.repository.updateNeed(need.record.id, need.record.version, 'fulfilled', {
            fulfilledBySnapshotId: decision.snapshot.snapshotId,
          }, planner.nowUnix);
        }
      } else if (decision.action === 'purchase') {
        const provider = decision.provider as EvidenceProviderRegistration;
        // The purchase identity is derived from the evidence need and provider,
        // not from one delivery's task key. Re-engagement tasks therefore reuse
        // a fresh/settled purchase instead of paying the same claim twice.
        const purchaseKey = `evidence:${evidenceNeedKey(planner.need as EvidenceNeed)}:${provider.providerId}`;
        const purchase = await options.repository.createPurchase({
          id: `purchase:${evidenceNeedKey(planner.need as EvidenceNeed)}:${provider.providerId}`,
          evidenceNeedId: need.record.id,
          idempotencyKey: purchaseKey,
          providerId: provider.providerId,
          priceUsdc: provider.priceUsdc,
          data: providerData(provider),
          now: planner.nowUnix,
        });
        let current = purchase.record;
        purchaseId = current.id;
        if (current.state === 'created') {
          if (provider.source === 'x402' && options.budget && input.budgetOwner) {
            const price = Number(provider.priceUsdc);
            if (!(await options.budget.fits(input.budgetOwner, price))) {
              options.budget.reached(input.budgetOwner);
              await context.checkpoint({
                checkpointKey: 'data-budget-reached',
                phase: 'authorization.recorded',
                data: {
                  mode: 'reviewed-evidence-operation-seam',
                  source: input.source,
                  decision: decision.action,
                  reason: 'DATA_BUDGET_REACHED',
                  evidenceNeedId: need.record.id,
                  evidenceNeedState: need.record.state,
                  budgetOwner: input.budgetOwner,
                  requiredUsdc: provider.priceUsdc,
                  providerCallMade: false,
                  financialMutation: false,
                  processedAtUnix,
                },
              });
              return { state: 'waiting', availableAt: processedAtUnix + 3_600 };
            }
            budgetOwner = input.budgetOwner;
            // Kept on the purchase before the provider call, so a later
            // reconciliation of an UNKNOWN outcome records the spend for the
            // right person without relying on task memory.
            current = await options.repository.updatePurchase(current.id, current.version, current.state, {
              data: { budgetOwner },
              now: planner.nowUnix,
            });
          }
          providerCallMade = true;
          financialMutation = provider.source === 'x402';
          let observation: z.infer<typeof providerResultSchema>;
          try {
            observation = providerResultSchema.parse(await options.adapter.acquire({
              provider,
              need: planner.need as EvidenceNeed,
              idempotencyKey: purchaseKey,
              nowUnix: planner.nowUnix,
            }));
          } catch (error) {
            observation = { state: 'unknown', failureCode: error instanceof Error ? error.message.slice(0, 160) : 'ADAPTER_ERROR' };
            failureCode = observation.failureCode;
          }
          for (const state of purchasePath(observation.state)) {
            current = await options.repository.updatePurchase(current.id, current.version, state, {
              ...(observation.providerTransactionId ? { providerTransactionId: observation.providerTransactionId } : {}),
              ...(observation.txHash ? { txHash: observation.txHash } : {}),
              ...(observation.failureCode ? { data: { failureCode: observation.failureCode } } : {}),
              now: planner.nowUnix,
            });
          }
          if (observation.snapshot) {
            const snapshot = await options.repository.recordSnapshot({
              ...snapshotRecord(observation.snapshot as EvidenceSnapshot, need.record.id, current.id),
              now: planner.nowUnix,
            });
            snapshotState = snapshot.record.state;
            if (current.state === 'settled' && snapshot.record.state === 'fresh' && need.record.state === 'open') {
              await options.repository.updateNeed(need.record.id, need.record.version, 'fulfilled', {
                fulfilledBySnapshotId: snapshot.record.id,
              }, planner.nowUnix);
            }
          }
        }
        purchaseState = current.state;
        const marked = await recordEvidenceSpend(options.repository, current, options.budget, planner.nowUnix);
        if (marked) current = marked;
      }

      await context.checkpoint({
        checkpointKey: 'evidence-operation-result',
        phase: 'authorization.recorded',
        ...(purchaseId ? { externalId: purchaseId } : {}),
        data: {
          mode: 'reviewed-evidence-operation-seam',
          source: input.source,
          decision: decision.action,
          reason: decision.reason,
          evidenceNeedId: need.record.id,
          evidenceNeedState: need.record.state,
          ...(purchaseId ? { purchaseId } : {}),
          ...(purchaseState ? { purchaseState } : {}),
          ...(snapshotState ? { snapshotState } : {}),
          ...(failureCode ? { failureCode } : {}),
          ...(budgetOwner ? { budgetOwner } : {}),
          providerCallMade,
          financialMutation,
          processedAtUnix,
        },
      });
      return { state: 'succeeded' };
    },
  };
}
