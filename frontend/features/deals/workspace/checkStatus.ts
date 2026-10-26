import type { DirectDeal } from '@/core/api';

export type CheckStatus = 'checking' | 'passed' | 'held' | 'unverified';

/// The delivery check line the deal page shows to both parties, or null when
/// there is nothing to say: no check ran, or the deal has already closed.
export function deliveryCheckStatus(
  deal: Pick<DirectDeal, 'deliveryCheck' | 'releaseBlockedReason'>,
  stage: string,
): CheckStatus | null {
  if (stage === 'settled' || stage === 'cancelled') return null;
  if (deal.releaseBlockedReason) return 'held';
  // Nothing is delivered for the step in hand; a check shown now would be the last milestone's.
  if (stage === 'awaiting-delivery') return null;
  return deal.deliveryCheck ?? null;
}
