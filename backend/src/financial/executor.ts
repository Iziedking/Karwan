import type {
  AuthorizedContractCommand,
  AuthorizedTransferCommand,
  CircleWalletAdapter,
  ProviderTransactionStatus,
  Submission,
} from '../circle/CircleWalletAdapter.js';
import {
  decideFinancialCommand,
  type CurrentFinancialState,
  type FinancialCommand,
  type FinancialDecisionResult,
  type FinancialPolicy,
  type ProviderLifecycle,
} from './commandBoundary.js';
import type {
  FinancialCommandInput,
  FinancialCommandRecord,
  FinancialRuntimeRepository,
} from './runtime.js';
import { FinancialApprovalClaimError, type FinancialApprovalClaimInput } from './approvalClaim.js';

/**
 * The executor is the only seam that may turn an already-authorized financial
 * decision into a provider submission. It is deliberately dependency
 * injected and is not wired into the legacy routes or the shadow handlers.
 *
 * The durable decision row is written before the provider call. A retry that
 * finds an existing CREATED row never submits again: the caller must reconcile
 * that row explicitly because a process crash could have happened immediately
 * before or after the provider received the request.
 */
export interface FinancialExecutionDescriptor {
  kind: 'transfer' | 'contract';
  walletId: string;
  tokenId?: string;
  contractAddress?: string;
  feeLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  amount?: string;
  abiFunctionSignature?: string;
  abiParameters?: readonly unknown[];
  callData?: string;
}

export interface ExecuteFinancialCommandInput {
  command: FinancialCommand;
  policy: FinancialPolicy;
  current: CurrentFinancialState;
  descriptor: FinancialExecutionDescriptor;
  repository: FinancialRuntimeRepository;
  adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'>;
  /**
   * Required for commands carrying approvalId. It must atomically transition
   * the exact approved record to executed before this executor calls Circle.
   */
  claimApproval?: (input: FinancialApprovalClaimInput) => Promise<unknown>;
  data?: Readonly<Record<string, unknown>>;
  now?: number;
}

export type FinancialExecutionStatus =
  | 'rejected'
  | 'approval_required'
  | 'submitted'
  | 'unknown'
  | 'failed'
  | 'already_recorded'
  | 'needs_reconciliation'
  | 'approval_unavailable';

export interface FinancialExecutionResult {
  status: FinancialExecutionStatus;
  decision: FinancialDecisionResult;
  record: FinancialCommandRecord;
  providerCalled: boolean;
  failureReason?: string;
}

function required(value: string | undefined, label: string): string {
  if (!value || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function contractAddress(value: string | undefined): `0x${string}` {
  const normalized = required(value, 'contractAddress').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error('contractAddress must be an EVM address');
  return normalized as `0x${string}`;
}

function lifecycleForSubmission(status: ProviderTransactionStatus): ProviderLifecycle {
  switch (status) {
    case 'FAILED':
    case 'CANCELLED':
    case 'DENIED':
      return 'FAILED';
    case 'UNKNOWN':
    case 'STUCK':
      return 'UNKNOWN';
    default:
      // A create response never proves settlement. Finality requires a later
      // read with a transaction hash through financial/reconciliation.ts.
      return 'SUBMITTED';
  }
}

function inputForDecision(
  command: FinancialCommand,
  decision: FinancialDecisionResult,
  data: Readonly<Record<string, unknown>> | undefined,
  now: number,
): FinancialCommandInput {
  return {
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    operation: command.operation,
    amountUsdc: command.amountUsdc,
    amountMicros: decision.amountMicros,
    sourceAddress: command.sourceAddress,
    destinationAddress: command.destinationAddress,
    expectedDealRoomVersion: command.expectedDealRoomVersion,
    ...(command.expectedOfferVersion === undefined ? {} : { expectedOfferVersion: command.expectedOfferVersion }),
    mandateVersion: command.mandateVersion,
    ...(command.approvalId ? { approvalId: command.approvalId } : {}),
    ...(command.approvalVersion === undefined ? {} : { approvalVersion: command.approvalVersion }),
    decision: decision.decision,
    reason: decision.reason,
    data: data ?? {},
    now,
  };
}

function resultStatusForDecision(decision: FinancialDecisionResult): FinancialExecutionStatus {
  if (decision.decision === 'REJECTED') return 'rejected';
  if (decision.decision === 'APPROVAL_REQUIRED') return 'approval_required';
  return 'submitted';
}

function existingRecordStatus(record: FinancialCommandRecord): 'already_recorded' | 'needs_reconciliation' {
  if (record.providerLifecycle === 'UNKNOWN' || record.providerLifecycle === 'RECONCILING') {
    return 'needs_reconciliation';
  }
  if (record.providerLifecycle === 'CREATED' && record.providerId === undefined) {
    return 'needs_reconciliation';
  }
  return 'already_recorded';
}

function commandForProvider(
  command: FinancialCommand,
  descriptor: FinancialExecutionDescriptor,
): AuthorizedTransferCommand | AuthorizedContractCommand {
  const walletId = required(descriptor.walletId, 'walletId');
  if (descriptor.kind === 'transfer') {
    return {
      idempotencyKey: command.idempotencyKey,
      walletId,
      tokenId: required(descriptor.tokenId, 'tokenId'),
      destinationAddress: command.destinationAddress,
      amountUsdc: command.amountUsdc,
      feeLevel: descriptor.feeLevel,
    };
  }
  return {
    idempotencyKey: command.idempotencyKey,
    walletId,
    contractAddress: contractAddress(descriptor.contractAddress),
    feeLevel: descriptor.feeLevel,
    ...(descriptor.amount === undefined ? {} : { amount: descriptor.amount }),
    ...(descriptor.callData
      ? { callData: descriptor.callData }
      : {
          abiFunctionSignature: required(descriptor.abiFunctionSignature, 'abiFunctionSignature'),
          abiParameters: [...(descriptor.abiParameters ?? [])],
        }),
  };
}

async function submit(
  adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'>,
  command: FinancialCommand,
  descriptor: FinancialExecutionDescriptor,
): Promise<Submission> {
  const providerCommand = commandForProvider(command, descriptor);
  return descriptor.kind === 'transfer'
    ? adapter.createTransfer(providerCommand as AuthorizedTransferCommand)
    : adapter.executeContract(providerCommand as AuthorizedContractCommand);
}

/**
 * Evaluate, persist, and (only when authorized) submit one command.
 *
 * This function intentionally does not retry a provider call. A timeout is
 * recorded as UNKNOWN and must be resolved by the read-only reconciliation
 * worker before any later state transition can claim settlement.
 */
export async function executeFinancialCommand(
  input: ExecuteFinancialCommandInput,
): Promise<FinancialExecutionResult> {
  const now = input.now ?? Date.now();
  const decision = decideFinancialCommand(input.command, input.policy, input.current);
  const persisted = await input.repository.recordDecision(
    inputForDecision(input.command, decision, input.data, now),
  );

  if (decision.decision !== 'AUTHORIZED') {
    return {
      status: resultStatusForDecision(decision),
      decision,
      record: persisted.record,
      providerCalled: false,
    };
  }

  if (!persisted.created) {
    return {
      status: existingRecordStatus(persisted.record),
      decision,
      record: persisted.record,
      providerCalled: false,
    };
  }

  if (input.command.approvalId) {
    if (!input.claimApproval) {
      return {
        status: 'approval_unavailable',
        decision,
        record: persisted.record,
        providerCalled: false,
        failureReason: 'APPROVAL_CLAIM_UNAVAILABLE',
      };
    }
    try {
      await input.claimApproval({
        command: input.command,
        executionNow: now,
      });
    } catch (error) {
      // The financial row remains CREATED and the provider is untouched. A
      // caller may inspect the approval/command pair and resolve it explicitly;
      // a replay cannot silently bypass the failed claim.
      return {
        status: 'approval_unavailable',
        decision,
        record: persisted.record,
        providerCalled: false,
        failureReason: error instanceof FinancialApprovalClaimError ? error.reason : 'APPROVAL_CLAIM_FAILED',
      };
    }
  }

  let submission: Submission;
  try {
    submission = await submit(input.adapter, input.command, input.descriptor);
  } catch (error) {
    const record = await input.repository.recordProviderUpdate(
      input.command.idempotencyKey,
      persisted.record.version,
      { lifecycle: 'UNKNOWN', failureCode: error instanceof Error ? error.message.slice(0, 200) : 'PROVIDER_CALL_FAILED' },
      now,
    );
    return {
      status: 'unknown',
      decision,
      record,
      providerCalled: true,
    };
  }
  const lifecycle = lifecycleForSubmission(submission.status);
  const record = await input.repository.recordProviderUpdate(
    input.command.idempotencyKey,
    persisted.record.version,
    {
      lifecycle,
      ...(submission.providerId ? { providerId: submission.providerId } : {}),
    },
    now,
  );
  return {
    status: lifecycle === 'UNKNOWN' ? 'unknown' : lifecycle === 'FAILED' ? 'failed' : 'submitted',
    decision,
    record,
    providerCalled: true,
  };
}
