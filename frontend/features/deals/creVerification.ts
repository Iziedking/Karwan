import type { DirectDeal } from '../../core/api';

export type CreVerificationState = NonNullable<DirectDeal['creVerification']>['state'];

export function creVerificationState(deal: Pick<DirectDeal, 'delivered' | 'creVerification' | 'evidenceReceipt'>): CreVerificationState {
  if (!deal.delivered) return 'awaitingDelivery';
  const receipt = deal.evidenceReceipt?.state;
  // A cached execution projection cannot override a missing or invalid chain result.
  if (receipt === 'pass' || receipt === 'mismatch') return receipt;
  if (receipt && receipt !== 'not-recorded') return 'unavailable';
  const state = deal.creVerification?.state;
  if (state === 'queued' || state === 'checking' || state === 'confirming' || state === 'awaitingRequest') return state;
  return 'unavailable';
}

export function creVerificationPollInterval(deal?: DirectDeal | null): number | false {
  if (!deal?.evidenceRequired || !deal.delivered || deal.settledAt || deal.cancelledAt) return false;
  const state = creVerificationState(deal);
  return state === 'pass' || state === 'mismatch' ? false : 5_000;
}
