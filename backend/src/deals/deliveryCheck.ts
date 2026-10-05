/// Why the delivery check paused a release, as one code both parties can be
/// told. The buyer-private requirement review text never goes in here; it is
/// added only where the buyer alone reads it.

import type { releaseBlockReasonForDelivery } from './releaseBlock.js';

export type DeliveryCheckDetail =
  | 'security-hold'
  | 'off-request'
  | 'evidence-mismatch'
  | 'check-pending'
  | 'check-expired'
  | 'terms-changed'
  | 'delivery-replaced'
  | 'link-unverifiable';

type CheckInput = Parameters<typeof releaseBlockReasonForDelivery>[0];

/// Same order as releaseBlockReasonForDelivery, so the reason told always
/// matches the block that applies.
export function deliveryCheckDetail(input: CheckInput): DeliveryCheckDetail | null {
  if (input.verificationStatus === 'suspicious' || input.verificationStatus === 'malicious') return 'security-hold';
  if (input.deliveryMatch?.verdict === 'mismatch') return 'off-request';
  const state = input.evidenceReceipt?.state;
  if (input.evidenceRequired && (!input.evidenceReceipt || state === 'not-configured' || state === 'not-recorded')) return 'check-pending';
  if (state === 'mismatch') return 'evidence-mismatch';
  if (state === 'expired') return 'check-expired';
  if (state === 'stale-terms') return 'terms-changed';
  if (state === 'stale-delivery') return 'delivery-replaced';
  if (state === 'unavailable' || state === 'read-unavailable') return 'check-pending';
  if (input.verificationStatus === 'unverifiable' || input.deliveryMatch?.verdict === 'unknown') return 'link-unverifiable';
  return null;
}

const BUYER: Record<DeliveryCheckDetail, string> = {
  'security-hold': 'The delivery link was flagged as unsafe, so it is hidden from you.',
  'off-request': 'The check found the delivery does not match what you asked for.',
  'evidence-mismatch': 'The delivery evidence does not match the agreed terms.',
  'check-pending': 'The automatic check has not returned a result yet.',
  'check-expired': 'The check result expired before payment was released.',
  'terms-changed': 'The terms changed after the check ran, so it has to run again.',
  'delivery-replaced': 'A newer delivery was submitted, so the check has to run again.',
  'link-unverifiable': 'The delivery link could not be opened to check it.',
};

const SELLER: Record<DeliveryCheckDetail, string> = {
  ...BUYER,
  'security-hold': 'Your delivery link was flagged as unsafe and is hidden from the buyer. Send a corrected link.',
  'off-request': 'The check found your delivery may not match the request. Send the right link.',
};

export function deliveryCheckReason(detail: DeliveryCheckDetail, role: 'buyer' | 'seller'): string {
  return (role === 'buyer' ? BUYER : SELLER)[detail];
}
