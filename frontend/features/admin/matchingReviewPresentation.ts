import type {
  AdminMatchingReview,
  AdminMatchingReviewDecision,
  AdminMatchingReviewItem,
} from '../../core/api';

export interface MatchingReviewRow extends AdminMatchingReviewItem {
  review: AdminMatchingReview | null;
}

export const MATCHING_REVIEW_DECISIONS: readonly {
  value: AdminMatchingReviewDecision;
  label: string;
  description: string;
}[] = [
  {
    value: 'retain_legacy',
    label: 'Retain legacy',
    description: 'Keep the current winner authoritative for this observation.',
  },
  {
    value: 'accept_shadow',
    label: 'Accept shadow',
    description: 'Record that the shadow result is understood for later review.',
  },
  {
    value: 'needs_more_evidence',
    label: 'Needs evidence',
    description: 'Leave the disagreement blocked pending more evidence.',
  },
];

export function buildMatchingReviewRows(
  queue: readonly AdminMatchingReviewItem[],
  reviews: readonly AdminMatchingReview[],
): MatchingReviewRow[] {
  const byObservation = new Map(reviews.map((review) => [review.observationKey, review]));
  return queue.map((item) => ({
    ...item,
    review: byObservation.get(item.observationKey) ?? null,
  }));
}

export function matchingReviewReasonLabel(reason: AdminMatchingReviewItem['reasons'][number]): string {
  switch (reason) {
    case 'winner-divergence':
      return 'Winner differs';
    case 'false-negative':
      return 'Legacy winner missing from shadow set';
    case 'semantic-review-pending':
      return 'Semantic review pending';
  }
}

export function matchingReviewDecisionLabel(decision: AdminMatchingReviewDecision): string {
  return MATCHING_REVIEW_DECISIONS.find((item) => item.value === decision)?.label ?? decision;
}
