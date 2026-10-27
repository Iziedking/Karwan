import type { DirectDeal } from '@/core/api';

export type CheckStatus = 'checking' | 'passed' | 'held' | 'unverified';

type CheckInput = Pick<DirectDeal, 'deliveryCheck' | 'releaseBlockedReason' | 'releaseBlockedDetail' | 'verificationStatus'>;

function linkHeld(deal: Partial<CheckInput>): boolean {
  return deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious';
}

/// The delivery check line the deal page shows to both parties, or null when
/// there is nothing to say: no check ran, or the deal has already closed.
export function deliveryCheckStatus(deal: Partial<CheckInput>, stage: string): CheckStatus | null {
  if (stage === 'settled' || stage === 'cancelled') return null;
  if (deal.releaseBlockedReason) return 'held';
  // Nothing is delivered for the step in hand; a check shown now would be the last milestone's.
  if (stage === 'awaiting-delivery') return null;
  // A link held for a safety check outranks the work matching the request.
  if (linkHeld(deal)) return 'held';
  return deal.deliveryCheck ?? null;
}

/// Why a held delivery is held. The watcher records the detail within a minute;
/// before that a held link reads as the link, and any other hold as the work.
export function heldDetailOf(deal: Partial<CheckInput>): NonNullable<DirectDeal['releaseBlockedDetail']> | undefined {
  if (deal.releaseBlockedDetail) return deal.releaseBlockedDetail;
  if (linkHeld(deal)) return 'security-hold';
  return deal.releaseBlockedReason ? undefined : 'off-request';
}
