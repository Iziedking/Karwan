import type { ApprovalRecord } from '../db/agentRuntime.js';
import { parseUsdcMicro } from '../matching/money.js';
import type { StakeRequirement, StakeSnapshot } from './policy.js';

export type StakeApprovalValidation =
  | { allowed: true; amountUsdc: string; requirementVersion: number; mandateVersion: number }
  | { allowed: false; reason: 'STATE_NOT_APPROVED' | 'EXPIRED' | 'REQUIREMENT_VERSION_MISMATCH' | 'MANDATE_VERSION_MISMATCH' | 'AMOUNT_MISMATCH' | 'DEAL_CLOSED' | 'WRONG_APPROVER' };

function value(data: ApprovalRecord['data'], key: string): string | number | undefined {
  const result = data[key];
  return typeof result === 'string' || typeof result === 'number' ? result : undefined;
}

/** Validates an approval immediately before a future executor consumes it. */
export function validateStakeApproval(
  approval: ApprovalRecord,
  requirement: StakeRequirement,
  snapshot: StakeSnapshot,
  nowUnix: number,
  actorAddress?: string,
): StakeApprovalValidation {
  if (approval.state !== 'approved') return { allowed: false, reason: 'STATE_NOT_APPROVED' };
  if (approval.expiresAt === undefined || approval.expiresAt <= nowUnix) return { allowed: false, reason: 'EXPIRED' };
  if (!snapshot.dealRoomOpen) return { allowed: false, reason: 'DEAL_CLOSED' };
  if (actorAddress !== undefined) {
    const expectedApprover = value(approval.data, 'approverAddress');
    if (
      typeof expectedApprover !== 'string' ||
      !/^0x[0-9a-f]{40}$/i.test(expectedApprover) ||
      !/^0x[0-9a-f]{40}$/i.test(actorAddress) ||
      expectedApprover.toLowerCase() !== actorAddress.toLowerCase()
    ) {
      return { allowed: false, reason: 'WRONG_APPROVER' };
    }
  }
  const recordedRequirementVersion = value(approval.data, 'requirementVersion');
  if (recordedRequirementVersion !== requirement.requirementVersion || snapshot.expectedRequirementVersion !== requirement.requirementVersion) {
    return { allowed: false, reason: 'REQUIREMENT_VERSION_MISMATCH' };
  }
  const recordedMandateVersion = value(approval.data, 'mandateVersion');
  if (recordedMandateVersion !== snapshot.mandateVersion) return { allowed: false, reason: 'MANDATE_VERSION_MISMATCH' };
  const amountUsdc = value(approval.data, 'amountUsdc');
  const requiredStake = parseUsdcMicro(requirement.requiredStakeUsdc);
  const freeStake = parseUsdcMicro(snapshot.freeStakeUsdc);
  const shortfall = requiredStake > freeStake ? requiredStake - freeStake : 0n;
  const expectedAmount = format(shortfall);
  if (amountUsdc !== expectedAmount) return { allowed: false, reason: 'AMOUNT_MISMATCH' };
  return {
    allowed: true,
    amountUsdc: expectedAmount,
    requirementVersion: requirement.requirementVersion,
    mandateVersion: snapshot.mandateVersion,
  };
}

function format(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
