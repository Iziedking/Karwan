import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore } from './durableTaskRunner.js';
import type { EvidenceRuntimeRepository } from '../evidence/runtime.js';
import { decideStakeQualification, type StakePolicy, type StakeRequirement, type StakeSnapshot } from '../staking/policy.js';
import type { NegotiationAttemptStore } from '../negotiation/attempts.js';
import type { AgentRuntimeRepository, ApprovalRecord } from '../db/agentRuntime.js';
import { ensureShadowDealRoom } from './shadowDealRoom.js';
import type { FinancialCommandShadowObserver } from './financialCommandShadow.js';
import { buildStakeFinancialObservation } from './stakeFinancialProjection.js';

export const STAKE_QUALIFICATION_SHADOW_TASK = 'stake.qualification.shadow';

const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/i);
const requirementSchema = z.object({
  requirementVersion: z.number().int().positive(), requiredStakeUsdc: z.string().min(1),
  stakeOwner: addressSchema, fundingWallet: addressSchema, vaultAddress: addressSchema,
  asset: z.literal('USDC'), network: z.string().min(1),
}).strict();
const snapshotSchema = z.object({
  freeStakeUsdc: z.string().min(1), liquidFundingUsdc: z.string().min(1),
  dealRoomOpen: z.boolean(), mandateVersion: z.number().int().positive(), expectedRequirementVersion: z.number().int().positive(),
}).strict();
const policySchema = z.object({
  autonomousMaxUsdc: z.string().min(1), allowedVaults: z.array(addressSchema).max(100),
  allowedNetworks: z.array(z.string().min(1)).max(50), allowedAssets: z.array(z.string().min(1)).max(50),
}).strict();
const blockerSchema = z.object({
  id: z.string().min(1), blockerKey: z.string().min(1), kind: z.string().min(1), subject: z.string().min(1), data: z.record(z.unknown()).default({}),
}).strict();
const resumeSchema = z.object({
  attemptId: z.string().min(1), attemptNumber: z.number().int().positive(), triggerReference: z.string().min(1),
  strategy: z.record(z.unknown()).default({}), priorOfferVersion: z.number().int().positive().optional(),
}).strict();
export const stakeQualificationShadowTaskSchema = z.object({
  dealRoomId: z.string().min(1), idempotencyKey: z.string().min(1), observedAtUnix: z.number().int().nonnegative(),
  source: z.enum(['matching-shadow', 'funding-confirmed', 'manual-fixture']),
  requirement: requirementSchema, snapshot: snapshotSchema, policy: policySchema,
  blocker: blockerSchema.optional(), confirmedFunding: z.boolean().default(false), resume: resumeSchema.optional(),
}).strict();

export type StakeQualificationShadowTaskData = z.infer<typeof stakeQualificationShadowTaskSchema>;
export interface StakeQualificationShadowObservation { data: StakeQualificationShadowTaskData }
export type StakeQualificationShadowObserver = (
  observation: StakeQualificationShadowObservation,
) => Promise<{ created: boolean }>;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

export function createStakeQualificationShadowObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): StakeQualificationShadowObserver {
  return async ({ data }) => {
    const parsed = stakeQualificationShadowTaskSchema.parse(data);
    if (roomRepository) {
      await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.observedAtUnix);
    }
    const result = await taskStore.enqueue({
      id: `task:stake:qualification:${parsed.dealRoomId}:${parsed.idempotencyKey}`,
      dealRoomId: parsed.dealRoomId,
      kind: STAKE_QUALIFICATION_SHADOW_TASK,
      idempotencyKey: parsed.idempotencyKey,
      availableAt: parsed.observedAtUnix,
      maxAttempts: 8,
      data: parsed as unknown as RuntimeData,
      now: parsed.observedAtUnix,
    });
    return { created: result.created };
  };
}

export function createStakeQualificationShadowHandlers(
  repository: EvidenceRuntimeRepository,
  options: {
    attemptStore?: NegotiationAttemptStore;
    approvalRepository?: AgentRuntimeRepository;
    financialObserver?: FinancialCommandShadowObserver;
    clock?: () => number;
  } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [STAKE_QUALIFICATION_SHADOW_TASK]: async (context) => {
      const now = options.clock?.() ?? Date.now();
      try {
        const input = stakeQualificationShadowTaskSchema.parse(context.task.data);
        const decision = decideStakeQualification(
          input.requirement satisfies StakeRequirement,
          input.snapshot satisfies StakeSnapshot,
          input.policy satisfies StakePolicy,
        );
        let blockerState: string | undefined;
        let approvalRecord: ApprovalRecord | undefined;
        let blockerRecord = input.blocker
          ? await repository.getBlockerByKey(input.blocker.blockerKey)
          : null;
        if (input.blocker && !blockerRecord && (decision.outcome === 'funding_required' || decision.outcome === 'approval_required')) {
          const created = await repository.createBlocker({
            id: input.blocker.id, dealRoomId: input.dealRoomId, blockerKey: input.blocker.blockerKey,
            kind: input.blocker.kind, subject: input.blocker.subject, data: { ...input.blocker.data, decision, shadowTask: input }, now: input.observedAtUnix,
          });
          blockerRecord = created.record;
        }
        if (blockerRecord) {
          blockerState = blockerRecord.state;
          if (input.confirmedFunding && blockerRecord.state === 'open') {
            const resolved = await repository.resolveBlocker(
              blockerRecord.id, blockerRecord.version, 'resolved', { resolution: 'confirmed-funding' }, input.observedAtUnix,
            );
            blockerState = resolved.state;
            if (options.attemptStore && input.resume) {
              await options.attemptStore.create({
                id: input.resume.attemptId,
                dealRoomId: input.dealRoomId,
                attemptNumber: input.resume.attemptNumber,
                trigger: 'FUNDS_CONFIRMED',
                triggerReference: input.resume.triggerReference,
                strategy: input.resume.strategy,
                ...(input.resume.priorOfferVersion === undefined ? {} : { priorOfferVersion: input.resume.priorOfferVersion }),
                data: { source: 'stake-qualification-shadow', blockerId: blockerRecord.id },
                now: input.observedAtUnix,
              });
            }
          }
        }
        if (options.approvalRepository && decision.outcome === 'approval_required') {
          const approvalKey = `stake:${input.dealRoomId}:requirement:${input.requirement.requirementVersion}:shortfall:${decision.shortfallUsdc}:mandate:${input.snapshot.mandateVersion}`;
          const approvalId = `approval:${approvalKey}`;
          const existing = await options.approvalRepository.getApproval(approvalId);
          if (existing) {
            approvalRecord = existing;
          } else {
            const approvalInput = {
              id: approvalId,
              dealRoomId: input.dealRoomId,
              requestKey: approvalKey,
              kind: 'stake',
              expiresAt: input.observedAtUnix + 3_600,
              data: {
                amountUsdc: decision.shortfallUsdc,
                requiredStakeUsdc: decision.amountUsdc,
                shortfallUsdc: decision.shortfallUsdc,
                requirementVersion: input.requirement.requirementVersion,
                mandateVersion: input.snapshot.mandateVersion,
                stakeOwner: input.requirement.stakeOwner,
                vaultAddress: input.requirement.vaultAddress,
                mode: 'read-only-shadow',
              },
              now: input.observedAtUnix,
            } as const;
            try {
              approvalRecord = await options.approvalRepository.createApproval(approvalInput);
            } catch (error) {
              const raced = await options.approvalRepository.getApproval(approvalId);
              if (!raced) throw error;
              approvalRecord = raced;
            }
          }
        }
        if (options.financialObserver) {
          const financialObservation = buildStakeFinancialObservation({
            dealRoomId: input.dealRoomId,
            requirement: input.requirement,
            snapshot: input.snapshot,
            policy: input.policy,
            decision,
            observedAtUnix: input.observedAtUnix,
            ...(approvalRecord ? {
              approval: {
                id: approvalRecord.id,
                version: approvalRecord.version,
                expiresAtUnix: approvalRecord.expiresAt ?? input.observedAtUnix + 3_600,
                amountUsdc: String((approvalRecord.data as { amountUsdc?: unknown }).amountUsdc ?? '0'),
              },
            } : {}),
          });
          if (financialObservation) {
            try {
              await options.financialObserver({ data: financialObservation });
            } catch (error) {
              // Financial shadowing is observational and must not alter stake
              // qualification or blocker state when its queue is unavailable.
              await context.checkpoint({
                checkpointKey: 'shadow-stake-financial-observation',
                phase: 'authorization.recorded',
                data: {
                  mode: 'read-only-shadow',
                  decision: 'financial-shadow-failed',
                  error: errorText(error),
                  providerCallMade: false,
                  financialMutation: false,
                  stakeExecuted: false,
                  processedAtUnix: now,
                },
              });
            }
          }
        }
        await context.checkpoint({
          checkpointKey: 'shadow-stake-decision',
          phase: 'authorization.recorded',
          data: {
            mode: 'read-only-shadow', decision: decision.outcome, source: input.source,
            requirementVersion: input.requirement.requirementVersion,
            ...(blockerState ? { blockerState } : {}),
            ...(approvalRecord ? { approvalId: approvalRecord.id, approvalState: approvalRecord.state, approvalVersion: approvalRecord.version } : {}),
            providerCallMade: false, financialMutation: false, stakeExecuted: false, processedAtUnix: now,
          },
        });
      } catch (error) {
        await context.checkpoint({
          checkpointKey: 'shadow-stake-decision',
          phase: 'authorization.recorded',
          data: {
            mode: 'read-only-shadow', decision: 'rejected', reason: 'STAKE_QUALIFICATION_INVALID', error: errorText(error),
            providerCallMade: false, financialMutation: false, stakeExecuted: false, processedAtUnix: now,
          },
        });
      }
      return { state: 'succeeded' };
    },
  };
}
