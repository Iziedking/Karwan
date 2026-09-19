import type { DirectDeal } from '../../core/api';

/// `manual` is the buyer having taken over a check that never answered. It is
/// a client state: the verifier itself never reports it.
export type CreVerificationState = NonNullable<DirectDeal['creVerification']>['state'] | 'manual';

export function creVerificationState(
  deal: Pick<DirectDeal, 'delivered' | 'creVerification' | 'evidenceReceipt' | 'evidenceManualReviewActive'>,
): CreVerificationState {
  if (!deal.delivered) return 'awaitingDelivery';
  const receipt = deal.evidenceReceipt?.state;
  // A cached execution projection cannot override a missing or invalid chain result.
  if (receipt === 'pass' || receipt === 'mismatch') return receipt;
  if (deal.evidenceManualReviewActive) return 'manual';
  if (receipt && receipt !== 'not-recorded') return 'unavailable';
  const state = deal.creVerification?.state;
  if (state === 'queued' || state === 'checking' || state === 'confirming' || state === 'awaitingRequest') return state;
  return 'unavailable';
}

export function creVerificationPollInterval(deal?: DirectDeal | null): number | false {
  if (!deal?.evidenceRequired || !deal.delivered || deal.settledAt || deal.cancelledAt) return false;
  const state = creVerificationState(deal);
  return state === 'pass' || state === 'mismatch' || state === 'manual' ? false : 5_000;
}
