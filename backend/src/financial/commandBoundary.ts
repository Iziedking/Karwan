import { parseUsdcMicro } from '../matching/money.js';

export type FinancialOperation = 'CONTRACT_ACCEPTANCE' | 'ESCROW_FUNDING' | 'STAKE' | 'X402_FUNDING' | 'MILESTONE_PAYOUT' | 'REFUND';
export type FinancialDecision = 'AUTHORIZED' | 'APPROVAL_REQUIRED' | 'REJECTED';

export interface FinancialCommand {
  commandId: string;
  idempotencyKey: string;
  operation: FinancialOperation;
  amountUsdc: string;
  sourceAddress: string;
  destinationAddress: string;
  expectedDealRoomVersion: number;
  expectedOfferVersion?: number;
  approvalId?: string;
  approvalVersion?: number;
  mandateVersion: number;
  nowUnix: number;
}

export interface FinancialPolicy {
  autonomousMaxUsdc: string;
  allowedDestinations: readonly string[];
  requireApprovalFor: readonly FinancialOperation[];
}

export interface CurrentFinancialState {
  dealRoomVersion: number;
  offerVersion?: number;
  mandateVersion: number;
  approval?: { id: string; version: number; expiresAtUnix: number; amountUsdc: string };
}

export interface FinancialDecisionResult {
  decision: FinancialDecision;
  amountMicros: string;
  reason: string;
  commandId: string;
  idempotencyKey: string;
}

function normalizedAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error('INVALID_FINANCIAL_ADDRESS');
  return normalized;
}

export function decideFinancialCommand(
  command: FinancialCommand,
  policy: FinancialPolicy,
  current: CurrentFinancialState,
): FinancialDecisionResult {
  const amountMicros = parseUsdcMicro(command.amountUsdc);
  if (amountMicros <= 0n) throw new Error('INVALID_FINANCIAL_AMOUNT');
  const source = normalizedAddress(command.sourceAddress);
  const destination = normalizedAddress(command.destinationAddress);
  if (source === destination) return result(command, amountMicros, 'REJECTED', 'SELF_TRANSFER');
  if (!policy.allowedDestinations.map(normalizedAddress).includes(destination)) {
    return result(command, amountMicros, 'REJECTED', 'DESTINATION_NOT_ALLOWLISTED');
  }
  if (command.expectedDealRoomVersion !== current.dealRoomVersion) return result(command, amountMicros, 'REJECTED', 'STALE_DEAL_ROOM');
  if (command.expectedOfferVersion !== undefined && command.expectedOfferVersion !== current.offerVersion) return result(command, amountMicros, 'REJECTED', 'STALE_OFFER');
  if (command.mandateVersion !== current.mandateVersion) return result(command, amountMicros, 'REJECTED', 'STALE_MANDATE');
  const autonomousMax = parseUsdcMicro(policy.autonomousMaxUsdc);
  const approval = current.approval;
  if (approval) {
    if (approval.id !== command.approvalId || approval.version !== command.approvalVersion) return result(command, amountMicros, 'REJECTED', 'STALE_APPROVAL');
    if (approval.expiresAtUnix <= command.nowUnix) return result(command, amountMicros, 'REJECTED', 'EXPIRED_APPROVAL');
    if (parseUsdcMicro(approval.amountUsdc) < amountMicros) return result(command, amountMicros, 'REJECTED', 'APPROVAL_AMOUNT_TOO_SMALL');
  }
  if (policy.requireApprovalFor.includes(command.operation) || amountMicros > autonomousMax) {
    if (!approval) return result(command, amountMicros, 'APPROVAL_REQUIRED', amountMicros > autonomousMax ? 'AUTONOMOUS_LIMIT_EXCEEDED' : 'APPROVAL_REQUIRED_BY_POLICY');
  }
  return result(command, amountMicros, 'AUTHORIZED', 'POLICY_ACCEPTED');
}

function result(command: FinancialCommand, amountMicros: bigint, decision: FinancialDecision, reason: string): FinancialDecisionResult {
  return { decision, amountMicros: amountMicros.toString(), reason, commandId: command.commandId, idempotencyKey: command.idempotencyKey };
}

export type ProviderLifecycle = 'CREATED' | 'SUBMITTED' | 'UNKNOWN' | 'RECONCILING' | 'SETTLED' | 'FAILED';

export interface ProviderSubmission {
  lifecycle: ProviderLifecycle;
  providerId?: string;
  txHash?: string;
  failureCode?: string;
}

export class InMemoryFinancialCommandLedger {
  private readonly decisions = new Map<string, FinancialDecisionResult>();
  private readonly submissions = new Map<string, ProviderSubmission>();

  decide(command: FinancialCommand, policy: FinancialPolicy, current: CurrentFinancialState): FinancialDecisionResult {
    const prior = this.decisions.get(command.idempotencyKey);
    if (prior) return prior;
    const decision = decideFinancialCommand(command, policy, current);
    this.decisions.set(command.idempotencyKey, decision);
    return decision;
  }

  recordSubmission(idempotencyKey: string, submission: ProviderSubmission): ProviderSubmission {
    const prior = this.submissions.get(idempotencyKey);
    if (prior) return prior;
    if (submission.lifecycle === 'SETTLED' && !submission.txHash) throw new Error('SETTLED_REQUIRES_TX_HASH');
    this.submissions.set(idempotencyKey, submission);
    return submission;
  }

  getSubmission(idempotencyKey: string): ProviderSubmission | null {
    return this.submissions.get(idempotencyKey) ?? null;
  }
}
