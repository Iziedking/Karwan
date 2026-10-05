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
  return deal.deliveryCheck ?? null;
}
