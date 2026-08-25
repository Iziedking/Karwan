import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseUsdcMicro } from '../matching/money.js';
import type { FinancialCommandShadowTaskData } from './financialCommandShadow.js';
import {
  createFinancialCommandOperationObserver,
  type FinancialCommandOperationTaskData,
} from '../financial/operationTask.js';
import type { AgentRuntimeRepository } from '../db/agentRuntime.js';
import type { DurableTaskStore } from './durableTaskRunner.js';
import type { ApprovalRecord } from '../db/agentRuntime.js';
import { validateStakeApproval, type StakeApprovalValidation } from '../staking/approval.js';
import { decideStakeQualification, type StakeDecision, type StakePolicy, type StakeRequirement, type StakeSnapshot } from '../staking/policy.js';

const addressPattern = /^0x[0-9a-f]{40}$/i;

const operationRequirementSchema = z.object({
  requirementVersion: z.number().int().positive(), requiredStakeUsdc: z.string().min(1),
  stakeOwner: z.string().regex(/^0x[0-9a-f]{40}$/i), fundingWallet: z.string().regex(/^0x[0-9a-f]{40}$/i),
  vaultAddress: z.string().regex(/^0x[0-9a-f]{40}$/i), asset: z.literal('USDC'), network: z.string().min(1),
}).strict();
const operationSnapshotSchema = z.object({
  freeStakeUsdc: z.string().min(1), liquidFundingUsdc: z.string().min(1), dealRoomOpen: z.boolean(),
  mandateVersion: z.number().int().positive(), expectedRequirementVersion: z.number().int().positive(),
}).strict();
const operationPolicySchema = z.object({
  autonomousMaxUsdc: z.string().min(1), allowedVaults: z.array(z.string().regex(/^0x[0-9a-f]{40}$/i)).max(100),
  allowedNetworks: z.array(z.string().min(1)).max(50), allowedAssets: z.array(z.string().min(1)).max(50),
}).strict();
const operationDecisionSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('already_qualified'), reason: z.literal('SUFFICIENT_FREE_STAKE'), requirementVersion: z.number().int().positive() }).strict(),
  z.object({ outcome: z.literal('auto_authorized'), amountUsdc: z.string().min(1), shortfallUsdc: z.string().min(1), requirementVersion: z.number().int().positive() }).strict(),
  z.object({ outcome: z.literal('approval_required'), amountUsdc: z.string().min(1), shortfallUsdc: z.string().min(1), reason: z.literal('AUTONOMOUS_LIMIT_EXCEEDED'), requirementVersion: z.number().int().positive() }).strict(),
  z.object({ outcome: z.literal('funding_required'), amountUsdc: z.string().min(1), shortfallUsdc: z.string().min(1), reason: z.literal('INSUFFICIENT_LIQUID_FUNDS'), requirementVersion: z.number().int().positive() }).strict(),
  z.object({ outcome: z.literal('blocked'), reason: z.enum(['DEAL_CLOSED', 'STALE_REQUIREMENT', 'DESTINATION_NOT_ALLOWLISTED', 'NETWORK_NOT_ALLOWLISTED', 'ASSET_NOT_ALLOWLISTED']) }).strict(),
]);
const operationExecutionSchema = z.object({
  walletId: z.string().min(1), contractAddress: z.string().regex(/^0x[0-9a-f]{40}$/i), feeLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  amount: z.string().min(1).optional(), abiFunctionSignature: z.string().min(1).optional(),
  abiParameters: z.array(z.unknown()).optional(), callData: z.string().min(1).optional(),
}).strict();
const stakeFinancialOperationInputSchema = z.object({
  dealRoomId: z.string().min(1), requirement: operationRequirementSchema, snapshot: operationSnapshotSchema,
  policy: operationPolicySchema, decision: operationDecisionSchema, observedAtUnix: z.number().int().nonnegative(),
  dealRoomVersion: z.number().int().positive().optional(),
  approval: z.object({ id: z.string().min(1), version: z.number().int().positive(), expiresAtUnix: z.number().int().nonnegative(), amountUsdc: z.string().min(1), state: z.literal('approved').optional() }).strict().optional(),
  execution: operationExecutionSchema, source: z.enum(['stake-resume', 'legacy-approval']).optional(),
}).strict();
const stakeApprovalResumeInputSchema = z.object({
  dealRoomId: z.string().min(1), approvalId: z.string().min(1), observedAtUnix: z.number().int().nonnegative(),
  requirement: operationRequirementSchema, snapshot: operationSnapshotSchema, policy: operationPolicySchema,
  dealRoomVersion: z.number().int().positive().optional(), actorAddress: z.string().regex(/^0x[0-9a-f]{40}$/i).optional(),
  execution: operationExecutionSchema, source: z.enum(['stake-resume', 'legacy-approval']).optional(),
}).strict();

export interface StakeFinancialProjectionInput {
  dealRoomId: string;
  requirement: StakeRequirement;
  snapshot: StakeSnapshot;
  policy: StakePolicy;
  decision: StakeDecision;
  observedAtUnix: number;
  dealRoomVersion?: number;
  approval?: {
    id: string;
    version: number;
    expiresAtUnix: number;
    amountUsdc: string;
    state?: 'approved';
  };
}

export interface StakeFinancialOperationInput extends StakeFinancialProjectionInput {
  execution: {
    walletId: string;
    contractAddress: string;
    feeLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    amount?: string;
    abiFunctionSignature?: string;
    abiParameters?: readonly unknown[];
    callData?: string;
  };
  source?: 'stake-resume' | 'legacy-approval';
}

export interface StakeApprovalResumeInput {
  dealRoomId: string;
  approvalId: string;
  observedAtUnix: number;
  requirement: StakeRequirement;
  snapshot: StakeSnapshot;
  policy: StakePolicy;
  dealRoomVersion?: number;
  actorAddress?: string;
  execution: StakeFinancialOperationInput['execution'];
  source?: StakeFinancialOperationInput['source'];
}

type StakeApprovalFailureReason = Extract<StakeApprovalValidation, { allowed: false }>['reason'];

export type StakeApprovalResumeValidation =
  | { allowed: true; operation: FinancialCommandOperationTaskData }
  | { allowed: false; reason: StakeApprovalFailureReason | 'APPROVAL_NOT_FOUND' | 'WRONG_DEAL_ROOM' | 'WRONG_APPROVAL_KIND' | 'DECISION_CHANGED' };
type StakeApprovalResumeFailureReason = Extract<StakeApprovalResumeValidation, { allowed: false }>['reason'];

export function parseStakeFinancialOperationInput(input: unknown): StakeFinancialOperationInput {
  return stakeFinancialOperationInputSchema.parse(input) as StakeFinancialOperationInput;
}

export function parseStakeApprovalResumeInput(input: unknown): StakeApprovalResumeInput {
  return stakeApprovalResumeInputSchema.parse(input) as StakeApprovalResumeInput;
}

/**
 * Projects a qualification shortfall into the financial command boundary.
 * This is deliberately a shadow-only representation: the source wallet and
 * vault are exact, but no wallet, contract, or provider is invoked here.
 */
export function buildStakeFinancialObservation(
  input: StakeFinancialProjectionInput,
): FinancialCommandShadowTaskData | null {
  const dealRoomId = input.dealRoomId.trim();
  if (!dealRoomId) throw new Error('stake financial projection requires a deal room id');
  if (!addressPattern.test(input.requirement.fundingWallet)
    || !addressPattern.test(input.requirement.vaultAddress)) {
    throw new Error('stake financial projection requires valid source and destination addresses');
  }
  if (!Number.isSafeInteger(input.observedAtUnix) || input.observedAtUnix < 0) {
    throw new Error('stake financial projection requires a valid observation time');
  }
  if (input.decision.outcome === 'already_qualified' || input.decision.outcome === 'blocked') return null;

  const shortfallUsdc = input.decision.shortfallUsdc;
  const shortfallMicros = parseUsdcMicro(shortfallUsdc);
  if (shortfallMicros <= 0n) throw new Error('stake financial projection requires a positive shortfall');
  if (input.decision.requirementVersion !== input.requirement.requirementVersion) {
    throw new Error('stake financial projection requirement version mismatch');
  }
  if (input.snapshot.expectedRequirementVersion !== input.requirement.requirementVersion) {
    throw new Error('stake financial projection snapshot requirement is stale');
  }

  // A funding-required decision has no available liquid source balance. Force
  // the shadow policy to require review even if the autonomous amount limit
  // would otherwise permit a stake; this must never look executable.
  const autonomousMaxUsdc = input.decision.outcome === 'funding_required'
    ? '0'
    : input.policy.autonomousMaxUsdc;
  const key = createHash('sha256')
    .update([
      dealRoomId,
      input.requirement.fundingWallet.toLowerCase(),
      input.requirement.vaultAddress.toLowerCase(),
      input.requirement.requirementVersion,
      shortfallMicros.toString(),
      input.snapshot.mandateVersion,
    ].join('|'))
    .digest('hex');
  const idempotencyKey = `legacy-stake:${key}`;

  return {
    dealRoomId,
    source: 'legacy-stake',
    command: {
      commandId: `legacy-stake-command:${key}`,
      idempotencyKey,
      operation: 'STAKE',
      amountUsdc: shortfallUsdc,
      sourceAddress: input.requirement.fundingWallet,
      destinationAddress: input.requirement.vaultAddress,
      expectedDealRoomVersion: input.dealRoomVersion ?? 1,
      mandateVersion: input.snapshot.mandateVersion,
      nowUnix: input.observedAtUnix,
      ...(input.approval ? { approvalId: input.approval.id, approvalVersion: input.approval.version } : {}),
    },
    policy: {
      autonomousMaxUsdc,
      allowedDestinations: [input.requirement.vaultAddress.toLowerCase()],
      requireApprovalFor: input.decision.outcome === 'auto_authorized' ? [] : ['STAKE'],
    },
    current: {
      dealRoomVersion: input.dealRoomVersion ?? 1,
      mandateVersion: input.snapshot.mandateVersion,
      ...(input.approval ? {
        approval: {
          id: input.approval.id,
          version: input.approval.version,
          expiresAtUnix: input.approval.expiresAtUnix,
          amountUsdc: input.approval.amountUsdc,
        },
      } : {}),
    },
  };
}

/**
 * Converts a policy-approved stake shortfall into the existing reviewed
 * financial operation task shape. This is a projection only: it requires an
 * explicit execution descriptor and an already-approved exact approval when
 * policy requires one, but it never enqueues a task or calls Circle.
 */
export function buildStakeFinancialOperation(
  input: StakeFinancialOperationInput,
): FinancialCommandOperationTaskData | null {
  const observation = buildStakeFinancialObservation(input);
  if (!observation) return null;
  if (input.decision.outcome === 'funding_required') return null;
  if (!input.execution.walletId.trim()) throw new Error('stake operation requires an execution wallet id');
  if (!addressPattern.test(input.execution.contractAddress)) {
    throw new Error('stake operation requires a valid contract address');
  }
  if (input.execution.contractAddress.toLowerCase() !== input.requirement.vaultAddress.toLowerCase()) {
    throw new Error('stake operation contract must equal the approved vault');
  }
  if (!input.execution.callData && !input.execution.abiFunctionSignature) {
    throw new Error('stake operation requires contract calldata or a function signature');
  }
  if (input.decision.outcome === 'auto_authorized' && input.approval) {
    throw new Error('auto-authorized stake must not carry an approval');
  }
  if (input.decision.outcome === 'approval_required') {
    if (!input.approval || input.approval.state !== 'approved') return null;
    if (parseUsdcMicro(input.approval.amountUsdc) !== parseUsdcMicro(input.decision.shortfallUsdc)) {
      throw new Error('stake operation approval amount mismatch');
    }
  }
  return {
    dealRoomId: observation.dealRoomId,
    source: input.source ?? 'stake-resume',
    command: observation.command,
    policy: observation.policy,
    current: observation.current,
    descriptor: {
      kind: 'contract',
      walletId: input.execution.walletId,
      contractAddress: input.execution.contractAddress,
      feeLevel: input.execution.feeLevel,
      ...(input.execution.amount === undefined ? {} : { amount: input.execution.amount }),
      ...(input.execution.abiFunctionSignature === undefined ? {} : { abiFunctionSignature: input.execution.abiFunctionSignature }),
      ...(input.execution.abiParameters === undefined ? {} : { abiParameters: [...input.execution.abiParameters] }),
      ...(input.execution.callData === undefined ? {} : { callData: input.execution.callData }),
    },
  };
}

/**
 * Revalidates a persisted approval immediately before projecting its exact
 * stake operation. This is intentionally read-only: the caller must still
 * consume the approval inside the reviewed financial executor before any
 * provider submission.
 */
export function buildStakeApprovalResumeOperation(
  input: StakeApprovalResumeInput,
  approval: ApprovalRecord | null,
): StakeApprovalResumeValidation {
  if (!approval) return { allowed: false, reason: 'APPROVAL_NOT_FOUND' };
  if (approval.id !== input.approvalId) return { allowed: false, reason: 'APPROVAL_NOT_FOUND' };
  if (approval.dealRoomId !== input.dealRoomId) return { allowed: false, reason: 'WRONG_DEAL_ROOM' };
  if (approval.kind.toLowerCase() !== 'stake') return { allowed: false, reason: 'WRONG_APPROVAL_KIND' };
  const validation = validateStakeApproval(
    approval,
    input.requirement,
    input.snapshot,
    input.observedAtUnix,
    input.actorAddress,
  );
  if (!validation.allowed) return validation;
  const decision = decideStakeQualification(input.requirement, input.snapshot, input.policy);
  if (decision.outcome !== 'approval_required') return { allowed: false, reason: 'DECISION_CHANGED' };
  const amountUsdc = String((approval.data as { amountUsdc?: unknown }).amountUsdc ?? validation.amountUsdc);
  const operation = buildStakeFinancialOperation({
    dealRoomId: input.dealRoomId,
    requirement: input.requirement,
    snapshot: input.snapshot,
    policy: input.policy,
    decision,
    observedAtUnix: input.observedAtUnix,
    ...(input.dealRoomVersion === undefined ? {} : { dealRoomVersion: input.dealRoomVersion }),
    approval: {
      id: approval.id,
      version: approval.version,
      expiresAtUnix: approval.expiresAt ?? input.observedAtUnix,
      amountUsdc,
      state: 'approved',
    },
    execution: input.execution,
    ...(input.source === undefined ? {} : { source: input.source }),
  });
  if (!operation) return { allowed: false, reason: 'DECISION_CHANGED' };
  return { allowed: true, operation };
}

/**
 * Bridges one exact, already-authorized stake projection into the existing
 * reviewed financial operation queue. The observer only validates and
 * enqueues; provider execution still requires the separately gated reviewed
 * operation worker and its injected adapter.
 */
export function createStakeFinancialOperationObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): (input: StakeFinancialOperationInput) => Promise<{ created: boolean }> {
  const observer = createFinancialCommandOperationObserver(taskStore, roomRepository);
  return async (input) => {
    const operation = buildStakeFinancialOperation(input);
    if (!operation) return { created: false };
    return observer(operation);
  };
}

/**
 * Loads and revalidates the durable approval, then delegates to the same
 * reviewed-operation enqueue boundary. Approval state is never changed here.
 */
export function createStakeApprovalResumeObserver(
  taskStore: DurableTaskStore,
  approvalRepository: Pick<AgentRuntimeRepository, 'getApproval'>,
  roomRepository?: AgentRuntimeRepository,
): (input: StakeApprovalResumeInput) => Promise<{ created: boolean; reason?: StakeApprovalResumeFailureReason }> {
  const enqueue = createFinancialCommandOperationObserver(taskStore, roomRepository);
  return async (input) => {
    const approval = await approvalRepository.getApproval(input.approvalId);
    const validation = buildStakeApprovalResumeOperation(input, approval);
    if (!validation.allowed) return { created: false, reason: validation.reason };
    return { ...(await enqueue(validation.operation)), reason: undefined };
  };
}
