import type { MoneyMovementState } from '../money/model.js';

/// A buyer's deadline cancel on a deal the seller never accepted runs two
/// chain steps: dispute, then refund. If the refund step never lands, the
/// escrow sits disputed with a refund the buyer already asked for. The
/// contract lets the buyer refund from exactly that state, so finishing it is
/// carrying out the buyer's own instruction, not ruling on a dispute.
export interface PendingRefundCheck {
  deal: { buyer: string; buyerAgentWalletId?: string; escrowVersion?: string; cancelledAt?: number; settledAt?: number };
  escrow: { disputed: boolean; wasAccepted?: boolean; version?: string };
  refund: { state: MoneyMovementState; initiatedBy: string } | null;
}

const RESUMABLE: ReadonlySet<MoneyMovementState> = new Set(['created', 'needs_attention']);

export function shouldResumePendingRefund({ deal, escrow, refund }: PendingRefundCheck): boolean {
  if (deal.cancelledAt || deal.settledAt || !deal.buyerAgentWalletId) return false;
  if (deal.escrowVersion === 'v3' || escrow.version === 'v3') return false;
  if (!escrow.disputed || escrow.wasAccepted !== false) return false;
  if (!refund || !RESUMABLE.has(refund.state)) return false;
  return refund.initiatedBy.toLowerCase() === deal.buyer.toLowerCase();
}
