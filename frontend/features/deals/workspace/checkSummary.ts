import type { DirectDeal } from '@/core/api';
import { deliveryCheckStatus, heldDetailOf } from './checkStatus';
import type { DealKind } from './dealSteps';

export interface CheckSummary {
  compared: 'work' | 'goods' | 'handover';
  result: 'checking' | 'matches' | 'received' | 'gap' | 'held' | 'unverified';
  /// The buyer's own review, in the agents' words. Never on the seller's side.
  detail?: string;
}

/// Checked by Karwan (view 44, rule 5): what the agents compared and what they
/// found, for the delivery in hand. Null before a delivery and once the deal
/// is over. The seller's side is built from the shared check alone.
export function checkSummary(deal: DirectDeal, viewerIsBuyer: boolean, kind: DealKind): CheckSummary | null {
  const status = deliveryCheckStatus(deal, deal.view?.stage ?? '');
  if (!status) return null;
  const compared = kind === 'shipped' ? 'goods' : kind === 'in_person' ? 'handover' : 'work';
  const security = status === 'held' && heldDetailOf(deal) === 'security-hold';
  const mismatch = deal.releaseBlockedReason === 'requirement-mismatch' || (status === 'held' && heldDetailOf(deal) === 'off-request');
  const result: CheckSummary['result'] = security
    ? 'held'
    : status === 'checking'
      ? 'checking'
      : status === 'unverified'
        ? 'unverified'
        : status === 'received'
          ? 'received'
        : viewerIsBuyer && (deal.deliveryMatch?.verdict === 'partial' || deal.deliveryMatch?.verdict === 'mismatch')
          ? 'gap'
          : mismatch
            ? 'gap'
            : status === 'held'
              ? 'held'
              : 'matches';
  const reason = viewerIsBuyer ? deal.deliveryMatch?.reason?.trim() : undefined;
  return reason && (result === 'matches' || result === 'gap') ? { compared, result, detail: reason } : { compared, result };
}
