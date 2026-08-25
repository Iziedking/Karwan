import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { AgentRuntimeRepository } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore } from './durableTaskRunner.js';
import { ensureShadowDealRoom } from './shadowDealRoom.js';
import {
  decideFinancialCommand,
  type FinancialOperation,
  type ProviderLifecycle,
  type ProviderSubmission,
} from '../financial/commandBoundary.js';
import { parseUsdcMicro } from '../matching/money.js';
import type {
  FinancialCommandInput,
  FinancialCommandRecord,
  FinancialRuntimeRepository,
} from '../financial/runtime.js';

export const FINANCIAL_COMMAND_SHADOW_TASK = 'financial.command.shadow';

const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/i);
const operationSchema = z.enum([
  'CONTRACT_ACCEPTANCE',
  'ESCROW_FUNDING',
  'STAKE',
  'X402_FUNDING',
  'MILESTONE_PAYOUT',
  'REFUND',
] satisfies [FinancialOperation, ...FinancialOperation[]]);
const lifecycleSchema = z.enum([
  'CREATED',
  'SUBMITTED',
  'UNKNOWN',
  'RECONCILING',
  'SETTLED',
  'FAILED',
] satisfies [ProviderLifecycle, ...ProviderLifecycle[]]);

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
}).strict();

const policySchema = z.object({
  autonomousMaxUsdc: z.string().min(1),
  allowedDestinations: z.array(addressSchema).max(100),
  requireApprovalFor: z.array(operationSchema).max(5),
}).strict();

const approvalSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  expiresAtUnix: z.number().int().nonnegative(),
  amountUsdc: z.string().min(1),
}).strict();

const currentStateSchema = z.object({
  dealRoomVersion: z.number().int().positive(),
  offerVersion: z.number().int().positive().optional(),
  mandateVersion: z.number().int().positive(),
  approval: approvalSchema.optional(),
}).strict();

const providerSchema = z.object({
  lifecycle: lifecycleSchema,
  providerId: z.string().min(1).optional(),
  txHash: z.string().min(1).optional(),
  failureCode: z.string().min(1).optional(),
}).strict();

const preFundingObservationSchema = z.object({
  balanceUsdc: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  requiredUsdc: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  outcome: z.enum(['sufficient', 'insufficient']),
  observedAtUnix: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  try {
    const balance = parseUsdcMicro(value.balanceUsdc);
    const required = parseUsdcMicro(value.requiredUsdc);
    if (required <= 0n) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredUsdc'], message: 'pre-funding requirement must be positive' });
    } else if (value.outcome === 'sufficient' && balance < required) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'sufficient pre-funding observation has insufficient balance' });
    } else if (value.outcome === 'insufficient' && balance >= required) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'insufficient pre-funding observation has sufficient balance' });
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['balanceUsdc'], message: 'invalid pre-funding amount' });
  }
});

const x402FundingObservationSchema = z.object({
  payerAgentAddress: addressSchema,
  gatewayWalletAddress: addressSchema,
  beneficiaryAddress: addressSchema,
  availableBeforeUsdc: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  requiredUsdc: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  phase: z.enum(['intent', 'submitted']),
  depositTxHash: z.string().min(1).optional(),
}).strict().superRefine((value, context) => {
  try {
    const available = parseUsdcMicro(value.availableBeforeUsdc);
    const required = parseUsdcMicro(value.requiredUsdc);
    if (available >= required) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['availableBeforeUsdc'],
        message: 'x402 funding observation must start below the required balance',
      });
    }
    if (value.phase === 'submitted' && !value.depositTxHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositTxHash'],
        message: 'submitted x402 funding observation requires a deposit transaction hash',
      });
    }
    if (value.phase === 'intent' && value.depositTxHash !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositTxHash'],
        message: 'intent x402 funding observation must not include a deposit transaction hash',
      });
    }
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availableBeforeUsdc'],
      message: 'invalid x402 funding amount',
    });
  }
});

const taskSchema = z.object({
  dealRoomId: z.string().min(1),
  source: z.enum(['legacy-accept', 'legacy-funding', 'legacy-stake', 'legacy-settlement', 'legacy-x402-funding', 'manual-fixture']),
  command: commandSchema,
  policy: policySchema,
  current: currentStateSchema,
  preFundingObservation: preFundingObservationSchema.optional(),
  x402FundingObservation: x402FundingObservationSchema.optional(),
  providerObservation: providerSchema.optional(),
}).strict();

export type FinancialCommandShadowTaskData = z.infer<typeof taskSchema>;

export function parseFinancialCommandShadowTask(input: unknown): FinancialCommandShadowTaskData {
  return taskSchema.parse(input);
}

export interface FinancialCommandShadowObservation {
  data: FinancialCommandShadowTaskData;
}

export type FinancialCommandShadowObserver = (
  observation: FinancialCommandShadowObservation,
) => Promise<void>;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

function providerFields(record: FinancialCommandRecord): RuntimeData {
  return {
    providerLifecycle: record.providerLifecycle,
    ...(record.providerId ? { providerId: record.providerId } : {}),
    ...(record.txHash ? { txHash: record.txHash } : {}),
    ...(record.failureCode ? { failureCode: record.failureCode } : {}),
  };
}

export function createFinancialCommandShadowObserver(
  taskStore: DurableTaskStore,
  roomRepository?: AgentRuntimeRepository,
): FinancialCommandShadowObserver {
  return async ({ data }) => {
    const parsed = parseFinancialCommandShadowTask(data);
    if (roomRepository) {
      await ensureShadowDealRoom(roomRepository, parsed.dealRoomId, parsed.command.nowUnix);
    }
    await taskStore.enqueue({
      id: `task:financial:command:${parsed.command.idempotencyKey}`,
      dealRoomId: parsed.dealRoomId,
      kind: FINANCIAL_COMMAND_SHADOW_TASK,
      idempotencyKey: parsed.command.idempotencyKey,
      availableAt: parsed.command.nowUnix,
      maxAttempts: 8,
      data: parsed as unknown as RuntimeData,
      now: parsed.command.nowUnix,
    });
  };
}

export function createFinancialCommandShadowHandlers(
  repository: FinancialRuntimeRepository,
  options: { clock?: () => number } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [FINANCIAL_COMMAND_SHADOW_TASK]: async (context) => {
      const now = options.clock?.() ?? Date.now();
      try {
        const input = parseFinancialCommandShadowTask(context.task.data);
        const decision = decideFinancialCommand(
          {
            commandId: input.command.commandId,
            idempotencyKey: input.command.idempotencyKey,
            operation: input.command.operation,
            amountUsdc: input.command.amountUsdc,
            sourceAddress: input.command.sourceAddress,
            destinationAddress: input.command.destinationAddress,
            expectedDealRoomVersion: input.command.expectedDealRoomVersion,
            ...(input.command.expectedOfferVersion === undefined ? {} : { expectedOfferVersion: input.command.expectedOfferVersion }),
            ...(input.command.approvalId ? { approvalId: input.command.approvalId } : {}),
            ...(input.command.approvalVersion === undefined ? {} : { approvalVersion: input.command.approvalVersion }),
            mandateVersion: input.command.mandateVersion,
            nowUnix: input.command.nowUnix,
          },
          input.policy,
          input.current,
        );
        const recorded = await repository.recordDecision({
          commandId: input.command.commandId,
          idempotencyKey: input.command.idempotencyKey,
          operation: input.command.operation,
          amountUsdc: input.command.amountUsdc,
          amountMicros: decision.amountMicros,
          sourceAddress: input.command.sourceAddress,
          destinationAddress: input.command.destinationAddress,
          expectedDealRoomVersion: input.command.expectedDealRoomVersion,
          ...(input.command.expectedOfferVersion === undefined ? {} : { expectedOfferVersion: input.command.expectedOfferVersion }),
          mandateVersion: input.command.mandateVersion,
          decision: decision.decision,
          reason: decision.reason,
          ...(input.command.approvalId ? { approvalId: input.command.approvalId } : {}),
          ...(input.command.approvalVersion === undefined ? {} : { approvalVersion: input.command.approvalVersion }),
          data: {
            mode: 'read-only-shadow',
            source: input.source,
            ...(input.preFundingObservation
              ? { legacyPreFunding: input.preFundingObservation }
              : {}),
            ...(input.x402FundingObservation
              ? { legacyX402Funding: input.x402FundingObservation }
              : {}),
          },
          now: input.command.nowUnix,
        } satisfies FinancialCommandInput);

        let record = recorded.record;
        if (input.providerObservation && decision.decision === 'AUTHORIZED') {
          record = await repository.recordProviderUpdate(
            record.idempotencyKey,
            record.version,
            input.providerObservation satisfies ProviderSubmission,
            input.command.nowUnix,
          );
        }
        await context.checkpoint({
          checkpointKey: 'shadow-financial-decision',
          phase: 'authorization.recorded',
          data: {
            mode: 'read-only-shadow',
            source: input.source,
            decision: decision.decision,
            reason: decision.reason,
            amountMicros: decision.amountMicros,
            commandId: decision.commandId,
            idempotencyKey: decision.idempotencyKey,
            ...providerFields(record),
            ...(input.providerObservation
              ? {
                  observedLegacyProviderLifecycle: input.providerObservation.lifecycle,
                  ...(input.providerObservation.providerId
                    ? { observedLegacyProviderId: input.providerObservation.providerId }
                    : {}),
                  ...(input.providerObservation.txHash
                    ? { observedLegacyTxHash: input.providerObservation.txHash }
                    : {}),
                }
              : {}),
            ...(input.preFundingObservation
              ? {
                  legacyPreFundingOutcome: input.preFundingObservation.outcome,
                  legacyPreFundingBalanceUsdc: input.preFundingObservation.balanceUsdc,
                  legacyPreFundingRequiredUsdc: input.preFundingObservation.requiredUsdc,
                  legacyPreFundingObservedAtUnix: input.preFundingObservation.observedAtUnix,
                }
              : {}),
            ...(input.x402FundingObservation
              ? {
                  x402FundingPhase: input.x402FundingObservation.phase,
                  x402FundingPayerAgentAddress: input.x402FundingObservation.payerAgentAddress,
                  x402FundingGatewayWalletAddress: input.x402FundingObservation.gatewayWalletAddress,
                  x402FundingBeneficiaryAddress: input.x402FundingObservation.beneficiaryAddress,
                  x402FundingAvailableBeforeUsdc: input.x402FundingObservation.availableBeforeUsdc,
                  x402FundingRequiredUsdc: input.x402FundingObservation.requiredUsdc,
                  ...(input.x402FundingObservation.depositTxHash
                    ? { x402FundingDepositTxHash: input.x402FundingObservation.depositTxHash }
                    : {}),
                }
              : {}),
            providerCallMade: false,
            financialMutation: false,
            processedAtUnix: now,
          },
        });
      } catch (error) {
        await context.checkpoint({
          checkpointKey: 'shadow-financial-decision',
          phase: 'authorization.recorded',
          data: {
            mode: 'read-only-shadow',
            decision: 'REJECTED',
            reason: 'FINANCIAL_COMMAND_INVALID',
            error: errorText(error),
            providerCallMade: false,
            financialMutation: false,
            processedAtUnix: now,
          },
        });
      }
      return { state: 'succeeded' };
    },
  };
}
