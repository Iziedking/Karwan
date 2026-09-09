import type { MoneyMovement } from './model.js';

export type PayoutRecoveryValidation =
  | { ok: true }
  | { ok: false; code: 'WRONG_REFERENCE' | 'WRONG_DEAL' | 'WRONG_KIND' | 'WRONG_PARTY' | 'NOT_ADVANCED' };

export function validatePayoutRecoveryTarget(
  movement: Pick<MoneyMovement, 'reference' | 'jobId' | 'kind' | 'participants' | 'milestoneIndex'>,
  input: { reference: string; jobId: string; buyer: string; milestonesReleased: number },
): PayoutRecoveryValidation {
  if (movement.reference.toUpperCase() !== input.reference.toUpperCase()) return { ok: false, code: 'WRONG_REFERENCE' };
  if (movement.jobId?.toLowerCase() !== input.jobId.toLowerCase()) return { ok: false, code: 'WRONG_DEAL' };
  if (movement.kind !== 'milestone_payout') return { ok: false, code: 'WRONG_KIND' };
  if (!movement.participants.some((party) => party.role === 'buyer' && party.address.toLowerCase() === input.buyer.toLowerCase())) {
    return { ok: false, code: 'WRONG_PARTY' };
  }
  if (movement.milestoneIndex == null || input.milestonesReleased <= movement.milestoneIndex) {
    return { ok: false, code: 'NOT_ADVANCED' };
  }
  return { ok: true };
}
