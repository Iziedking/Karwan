import type { AgentRuntimeRepository, ApprovalRecord } from '../db/agentRuntime.js';
import type { FinancialCommand } from './commandBoundary.js';
import { parseUsdcMicro } from '../matching/money.js';

export class FinancialApprovalClaimError extends Error {
  constructor(readonly reason: FinancialApprovalClaimReason) {
    super(`financial approval claim refused: ${reason}`);
    this.name = 'FinancialApprovalClaimError';
  }
}

export type FinancialApprovalClaimReason =
  | 'APPROVAL_NOT_FOUND'
  | 'APPROVAL_NOT_APPROVED'
  | 'APPROVAL_VERSION_MISMATCH'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_AMOUNT_MISMATCH'
  | 'APPROVAL_OPERATION_MISMATCH'
  | 'APPROVAL_DESTINATION_MISMATCH'
  | 'APPROVAL_ACTOR_MISMATCH';

export interface FinancialApprovalClaimInput {
  command: FinancialCommand;
  executionNow: number;
  /** Optional caller identity. Omitted for legacy-compatible internal callers. */
  actorAddress?: string;
}

function scalar(data: ApprovalRecord['data'], key: string): string | number | undefined {
  const value = data[key];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(value);
}

/**
 * Claims one exact approved command immediately before provider submission.
 * The approval transition is optimistic and terminal, so only one concurrent
 * worker can consume it. A provider timeout after this claim remains a
 * financial UNKNOWN and must be reconciled instead of replayed.
 */
export async function claimFinancialApproval(
  repository: Pick<AgentRuntimeRepository, 'getApproval' | 'updateApproval'>,
  input: FinancialApprovalClaimInput,
): Promise<ApprovalRecord> {
  const approvalId = input.command.approvalId;
  const approvalVersion = input.command.approvalVersion;
  if (!approvalId || approvalVersion === undefined) {
    throw new FinancialApprovalClaimError('APPROVAL_VERSION_MISMATCH');
  }

  const approval = await repository.getApproval(approvalId);
  if (!approval) throw new FinancialApprovalClaimError('APPROVAL_NOT_FOUND');
  if (approval.state !== 'approved') throw new FinancialApprovalClaimError('APPROVAL_NOT_APPROVED');
  if (approval.version !== approvalVersion) throw new FinancialApprovalClaimError('APPROVAL_VERSION_MISMATCH');
  if (approval.expiresAt !== undefined && approval.expiresAt <= input.command.nowUnix) {
    throw new FinancialApprovalClaimError('APPROVAL_EXPIRED');
  }

  const recordedAmount = scalar(approval.data, 'amountUsdc');
  if (recordedAmount !== undefined) {
    try {
      if (parseUsdcMicro(String(recordedAmount)) !== parseUsdcMicro(input.command.amountUsdc)) {
        throw new FinancialApprovalClaimError('APPROVAL_AMOUNT_MISMATCH');
      }
    } catch (error) {
      if (error instanceof FinancialApprovalClaimError) throw error;
      throw new FinancialApprovalClaimError('APPROVAL_AMOUNT_MISMATCH');
    }
  }
  const recordedOperation = scalar(approval.data, 'operation');
  if (recordedOperation !== undefined && recordedOperation !== input.command.operation) {
    throw new FinancialApprovalClaimError('APPROVAL_OPERATION_MISMATCH');
  }
  const recordedDestination = scalar(approval.data, 'destinationAddress');
  if (recordedDestination !== undefined && String(recordedDestination).toLowerCase() !== input.command.destinationAddress.toLowerCase()) {
    throw new FinancialApprovalClaimError('APPROVAL_DESTINATION_MISMATCH');
  }
  if (input.actorAddress !== undefined) {
    const approverAddress = scalar(approval.data, 'approverAddress');
    if (
      typeof approverAddress !== 'string'
      || !isAddress(approverAddress)
      || !isAddress(input.actorAddress)
      || approverAddress.toLowerCase() !== input.actorAddress.toLowerCase()
    ) {
      throw new FinancialApprovalClaimError('APPROVAL_ACTOR_MISMATCH');
    }
  }

  return repository.updateApproval(
    approval.id,
    approval.version,
    'executed',
    {
      financialCommandId: input.command.commandId,
      financialIdempotencyKey: input.command.idempotencyKey,
      executedAtUnix: input.command.nowUnix,
    },
    input.executionNow,
  );
}
