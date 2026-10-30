import type { FactoringOffer } from '@/core/api';

export type PositionStatus = 'pending' | 'paySeller' | 'active' | 'repaid' | 'closed' | 'declined' | 'expired' | 'review';

/// What a financing position page says for an offer's state (view 43). The
/// escrow family added paying the seller, repaid and closed; each reads as
/// itself instead of falling back to pending.
export function positionStatus(status: FactoringOffer['status']): PositionStatus {
  switch (status) {
    case 'awaiting_financier':
      return 'paySeller';
    case 'accepted':
      return 'active';
    case 'settled':
    case 'repaid':
      return 'repaid';
    case 'waived':
      return 'closed';
    case 'defaulted':
      return 'review';
    case 'expired':
      return 'expired';
    case 'rejected':
    case 'superseded':
      return 'declined';
    default:
      return 'pending';
  }
}
