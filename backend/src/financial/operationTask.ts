import { z } from 'zod';
import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import type { AgentRuntimeRepository } from '../db/agentRuntime.js';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore, EnqueueTaskInput } from '../agents/durableTaskRunner.js';
import { ensureShadowDealRoom } from '../agents/shadowDealRoom.js';
import type { FinancialCommand, FinancialPolicy, CurrentFinancialState } from './commandBoundary.js';
import { claimFinancialApproval } from './approvalClaim.js';
import { executeFinancialCommand, type FinancialExecutionDescriptor } from './executor.js';
import type { FinancialRuntimeRepository } from './runtime.js';

export const FINANCIAL_COMMAND_OPERATION_TASK = 'financial.command.operation';

const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/i);
const operationSchema = z.enum(['CONTRACT_ACCEPTANCE', 'ESCROW_FUNDING', 'STAKE', 'X402_FUNDING', 'MILESTONE_PAYOUT', 'REFUND']);
const commandSchema = z.object({
  commandId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  operation: operationSchema,
  amountUsdc: z.string().min(1),
  sourceAddress: addressSchema,
  destinationAddress: addressSchema,
  expectedDealRoomVersion: z.number().int().positive(),
  expectedOfferVersion: z.number().int().positive().optional(),
  mandateVersion: z.number().int().positive(),
  nowUnix: z.number().int().nonnegative(),
  approvalId: z.string().min(1).optional(),
  approvalVersion: z.number().int().positive().optional(),
  actorAddress: addressSchema.optional(),
}).strict();
const policySchema = z.object({
  autonomousMaxUsdc: z.string().min(1),
  allowedDestinations: z.array(addressSchema).max(100),
  requireApprovalFor: z.array(operationSchema).max(5),
}).strict();
const currentSchema = z.object({
  dealRoomVersion: z.number().int().positive(),
  offerVersion: z.number().int().positive().optional(),
  mandateVersion: z.number().int().positive(),
  approval: z.object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    expiresAtUnix: z.number().int().nonnegative(),
    amountUsdc: z.string().min(1),
  }).strict().optional(),
}).strict();
const descriptorSchema = z.object({
  kind: z.enum(['transfer', 'contract']),
  walletId: z.string().min(1),
  tokenId: z.string().min(1).optional(),
  contractAddress: addressSchema.optional(),
  feeLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  amount: z.string().min(1).optional(),
  abiFunctionSignature: z.string().min(1).optional(),
  abiParameters: z.array(z.unknown()).optional(),
  callData: z.string().min(1).optional(),
}).strict();
const taskDataSchema = z.object({
  dealRoomId: z.string().min(1),
  command: commandSchema,
  policy: policySchema,
  current: currentSchema,
  descriptor: descriptorSchema,
  source: z.enum(['manual-review', 'stake-resume', 'legacy-approval']),
}).strict();

export type FinancialCommandOperationTaskData = z.infer<typeof taskDataSchema>;

export function parseFinancialCommandOperationTask(input: unknown): FinancialCommandOperationTaskData {
  return taskDataSchema.parse(input);
}

export function createFinancialCommandOperationObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): (data: FinancialCommandOperationTaskData) => Promise<{ created: boolean }> {
  return async (data) => {
    const parsed = parseFinancialCommandOperationTask(data);
    if (roomRepository) await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.command.nowUnix);
    const input: EnqueueTaskInput = {
      id: `task:financial:operation:${parsed.command.idempotencyKey}`,
      dealRoomId: parsed.dealRoomId,
      kind: FINANCIAL_COMMAND_OPERATION_TASK,
      idempotencyKey: `financial-operation:${parsed.command.idempotencyKey}`,
      availableAt: parsed.command.nowUnix,
      maxAttempts: 3,
      data: parsed as unknown as RuntimeData,
      now: parsed.command.nowUnix,
    };
    const result = await taskStore.enqueue(input);
    return { created: result.created };
  };
}

export interface FinancialCommandOperationHandlerOptions {
  repository: FinancialRuntimeRepository;
  approvalRepository?: Pick<AgentRuntimeRepository, 'getApproval' | 'updateApproval'>;
  adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'>;
  clock?: () => number;
}

function checkpointData(
  input: FinancialCommandOperationTaskData,
  result: Awaited<ReturnType<typeof executeFinancialCommand>>,
  now: number,
): RuntimeData {
  return {
    mode: 'reviewed-operation-seam',
    source: input.source,
    status: result.status,
    decision: result.decision.decision,
    reason: result.decision.reason,
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
    providerLifecycle: result.record.providerLifecycle,
    ...(result.record.providerId ? { providerId: result.record.providerId } : {}),
    ...(result.record.txHash ? { txHash: result.record.txHash } : {}),
    providerCallMade: result.providerCalled,
    financialMutation: result.providerCalled,
    approvalClaimed: result.record.approvalId !== undefined && result.status !== 'approval_unavailable',
    processedAtUnix: now,
  };
}

/**
 * Builds an injected operation handler for the durable runner. Merely
 * constructing this map does not enable execution; callers must explicitly
 * provide a provider adapter and register the map under a reviewed flag.
 */
export function createFinancialCommandOperationHandlers(
  options: FinancialCommandOperationHandlerOptions,
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [FINANCIAL_COMMAND_OPERATION_TASK]: async (context) => {
      const now = options.clock?.() ?? Date.now();
      const input = parseFinancialCommandOperationTask(context.task.data);
      const result = await executeFinancialCommand({
        command: input.command as FinancialCommand,
        policy: input.policy as FinancialPolicy,
        current: input.current as CurrentFinancialState,
        descriptor: input.descriptor as FinancialExecutionDescriptor,
        repository: options.repository,
        adapter: options.adapter,
        ...(input.command.approvalId && options.approvalRepository
          ? {
              claimApproval: (claim: Parameters<typeof claimFinancialApproval>[1]) =>
                claimFinancialApproval(options.approvalRepository!, {
                  ...claim,
                  ...(input.command.actorAddress ? { actorAddress: input.command.actorAddress } : {}),
                }),
            }
          : {}),
        ...(input.command.actorAddress ? { data: { actorAddress: input.command.actorAddress } } : {}),
        now,
      });
      await context.checkpoint({
        checkpointKey: 'financial-operation-result',
        phase: 'authorization.recorded',
        ...(result.record.providerId ? { externalId: result.record.providerId } : {}),
        data: checkpointData(input, result, now),
      });
      return { state: 'succeeded' };
    },
  };
}
