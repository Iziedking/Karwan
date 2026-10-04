import type { DirectDeal } from '../db/deals.js';
import { deliveryFailedCheck } from './disputeTimeout.js';

export type DeadlineDeal = Pick<
  DirectDeal,
  'deadlineUnix' | 'delivered' | 'disputed' | 'disputedAt' | 'disputedBy' | 'releaseBlockedReason' | 'releaseBlockedAt' | 'deliveredAt' | 'deliveryMatch' | 'deadlineRuleAt'
>;

export type DeadlineAction =
  | { kind: 'none' }
  | { kind: 'refund'; cause: 'failed-at-deadline' | 'seller-silent'; reason: string }
  | { kind: 'arbiter'; cause: 'partial-at-deadline'; reason: string };

/// The owner's deadline rules for a v2 deal (spec 2026-10-04, decisions 2 to 4):
/// a delivery still failing the check at the deadline is refunded; a partial one
/// goes to the arbiter for a partial payment; a seller silent through the
/// statement window after the buyer disputed is refunded against.
export function deadlineRuleAction(
  deal: DeadlineDeal,
  input: { now: number; graceMs: number; statementWindowMs: number; sellerRespondedAfterDispute: boolean },
): DeadlineAction {
  if (deal.deadlineRuleAt || !deal.delivered) return { kind: 'none' };

  const pastDeadline = !!deal.deadlineUnix && input.now > deal.deadlineUnix * 1000 + input.graceMs;
  // A delivery newer than the block has not been checked yet; wait for its own result.
  const staleCheck = !!deal.releaseBlockedAt && !!deal.deliveredAt && deal.deliveredAt > deal.releaseBlockedAt;
  if (pastDeadline && !staleCheck && deliveryFailedCheck(deal)) {
    return { kind: 'refund', cause: 'failed-at-deadline', reason: 'deadline rule: the delivery still failed the check at the delivery deadline' };
  }
  if (pastDeadline && deal.deliveryMatch?.verdict === 'partial') {
    return { kind: 'arbiter', cause: 'partial-at-deadline', reason: 'deadline rule: part of the work was delivered by the deadline; the arbiter sets the payment' };
  }

  if (
    deal.disputed &&
    deal.disputedBy === 'buyer' &&
    deal.disputedAt &&
    input.now > deal.disputedAt + input.statementWindowMs &&
    !input.sellerRespondedAfterDispute
  ) {
    return { kind: 'refund', cause: 'seller-silent', reason: 'deadline rule: the seller did not respond within the statement window' };
  }
  return { kind: 'none' };
}
