import { canTransitionMovement, type MoneyMovementState } from './model.js';

export interface EscrowPayout {
  txHash: string;
  value: bigint;
}

/// Which escrow-to-financier payments prove a repayment. One payment of the
/// exact amount is preferred; otherwise the payments are added in order, and
/// the release that brought the total to the amount owed completes it, which
/// is how a deal paid in several milestones repays its financier. `payments`
/// are the transfers to record, each at its own amount, because a receipt is
/// only ever proof of the transfer it carries.
export function repaymentProof(payouts: readonly EscrowPayout[], amount: bigint): { txHash: string; parts: number; payments: EscrowPayout[] } | null {
  const exact = payouts.find((p) => p.value === amount);
  if (exact) return { txHash: exact.txHash, parts: 1, payments: [{ txHash: exact.txHash, value: exact.value }] };
  let total = 0n;
  for (const [index, p] of payouts.entries()) {
    total += p.value;
    if (total >= amount) {
      const payments = payouts.slice(0, index + 1).map(({ txHash, value }) => ({ txHash, value }));
      return { txHash: p.txHash, parts: index + 1, payments };
    }
  }
  return null;
}

/// When a repayment is recorded in parts, a whole-amount record an earlier
/// attempt opened (and could never verify) is closed, so it does not sit in the
/// history as money still in flight.
export function closesWholeRecord(state: MoneyMovementState, parts: number): boolean {
  return parts > 1 && state !== 'cancelled' && canTransitionMovement(state, 'cancelled');
}
