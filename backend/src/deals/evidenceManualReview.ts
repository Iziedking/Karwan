import type { DirectDeal } from '../db/deals.js';

type ReceiptState =
  | 'not-configured'
  | 'not-recorded'
  | 'pass'
  | 'mismatch'
  | 'unavailable'
  | 'expired'
  | 'stale-terms'
  | 'stale-delivery'
  | 'read-unavailable';

type ReviewDeal = Pick<
  DirectDeal,
  | 'evidenceRequired'
  | 'delivered'
  | 'deliveredAt'
  | 'settledAt'
  | 'cancelledAt'
  | 'deliveryRevision'
  | 'agreementVersion'
  | 'verificationStatus'
  | 'creDeliveryRequest'
  | 'creAutoPublication'
  | 'evidenceManualReview'
>;

/// A manual review counts only for the delivery and agreement it was given for.
export function manualReviewActive(deal: ReviewDeal): boolean {
  const review = deal.evidenceManualReview;
  return !!review
    && review.deliveryRevision === (deal.deliveryRevision ?? 0)
    && review.agreementVersion === (deal.agreementVersion ?? 1);
}

export type ManualReviewEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: 'not-required' | 'not-delivered' | 'closed' | 'security-hold' | 'answered' | 'already-reviewed' | 'still-checking';
    };

/// The buyer may skip the delivery check only once it has visibly stalled: the
/// request expired, publication failed, the verifier reported it could not run,
/// or nothing came back within `stallMs`. An answer, pass or mismatch, is never
/// skippable, and neither is a security hold on the delivery link.
export function manualReviewEligibility(
  deal: ReviewDeal,
  receiptState: ReceiptState | undefined,
  nowMs: number,
  stallMs: number,
): ManualReviewEligibility {
  if (deal.evidenceRequired !== true) return { eligible: false, reason: 'not-required' };
  if (!deal.delivered) return { eligible: false, reason: 'not-delivered' };
  if (deal.settledAt || deal.cancelledAt) return { eligible: false, reason: 'closed' };
  if (deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious') {
    return { eligible: false, reason: 'security-hold' };
  }
  if (receiptState === 'pass' || receiptState === 'mismatch') return { eligible: false, reason: 'answered' };
  if (manualReviewActive(deal)) return { eligible: false, reason: 'already-reviewed' };

  const request = deal.creDeliveryRequest;
  const startedAt = request?.publishedAt ?? deal.deliveredAt;
  const stalled =
    !!deal.creAutoPublication?.error
    || (!!request && request.expiresAt * 1_000 <= nowMs)
    || receiptState === 'unavailable'
    || receiptState === 'read-unavailable'
    || (startedAt != null && nowMs - startedAt >= stallMs);
  return stalled ? { eligible: true } : { eligible: false, reason: 'still-checking' };
}
