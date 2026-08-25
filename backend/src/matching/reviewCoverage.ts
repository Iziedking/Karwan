import type { MatchingAuditReviewItem } from './audit.js';
import type { MatchingAuditReview, MatchingAuditReviewDecision } from './review.js';

export interface MatchingReviewCoverage {
  queueCount: number;
  reviewedCount: number;
  pendingCount: number;
  /** Reviewed items that explicitly remain blocked pending more evidence. */
  needsMoreEvidenceCount: number;
  byDecision: Record<MatchingAuditReviewDecision, number>;
  scanComplete: boolean;
}

export interface MatchingReviewCoverageInput {
  queue: readonly MatchingAuditReviewItem[];
  reviews: readonly MatchingAuditReview[];
  /** False when the audit window was bounded before all observations were read. */
  scanComplete?: boolean;
}

const DECISIONS: readonly MatchingAuditReviewDecision[] = [
  'retain_legacy',
  'accept_shadow',
  'needs_more_evidence',
];

/**
 * Join immutable queue items to immutable human dispositions without changing
 * winner selection. Reviews for observations outside this queue are ignored.
 */
export function buildMatchingReviewCoverage(
  input: MatchingReviewCoverageInput,
): MatchingReviewCoverage {
  const reviewsByObservation = new Map<string, MatchingAuditReview>();
  for (const review of input.reviews) {
    const prior = reviewsByObservation.get(review.observationKey);
    if (!prior || review.createdAt > prior.createdAt) {
      reviewsByObservation.set(review.observationKey, review);
    }
  }

  const byDecision = Object.fromEntries(DECISIONS.map((decision) => [decision, 0])) as Record<MatchingAuditReviewDecision, number>;
  let reviewedCount = 0;
  let needsMoreEvidenceCount = 0;
  for (const item of input.queue) {
    const review = reviewsByObservation.get(item.observationKey);
    if (!review) continue;
    reviewedCount += 1;
    byDecision[review.decision] += 1;
    if (review.decision === 'needs_more_evidence') needsMoreEvidenceCount += 1;
  }

  return {
    queueCount: input.queue.length,
    reviewedCount,
    pendingCount: input.queue.length - reviewedCount,
    needsMoreEvidenceCount,
    byDecision,
    scanComplete: input.scanComplete ?? true,
  };
}
