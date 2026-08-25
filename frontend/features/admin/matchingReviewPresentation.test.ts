import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminMatchingReviewItem } from '../../core/api';
import {
  buildMatchingReviewRows,
  matchingReviewDecisionLabel,
  matchingReviewReasonLabel,
  MATCHING_REVIEW_DECISIONS,
} from './matchingReviewPresentation';

const item: AdminMatchingReviewItem = {
  observationKey: 'buyer-bids:job-1:mandate-1',
  source: 'buyer-bids' as const,
  mandateId: 'mandate-1',
  mandateVersion: 1,
  observedAt: 100,
  reasons: ['winner-divergence', 'semantic-review-pending'],
  legacyWinnerId: 'seller-legacy',
  shadowWinnerId: 'seller-shadow',
};

test('review rows join only by immutable observation key', () => {
  const rows = buildMatchingReviewRows(
    [item],
    [{
      reviewId: 'review-1',
      observationKey: item.observationKey,
      decision: 'retain_legacy',
      reviewer: 'operator@example.test',
      createdAt: 200,
    }],
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.review?.decision, 'retain_legacy');
});

test('unreviewed disagreements remain visibly actionable', () => {
  const [row] = buildMatchingReviewRows([item], []);
  assert.equal(row?.review, null);
  assert.equal(matchingReviewReasonLabel(item.reasons[0]), 'Winner differs');
  assert.equal(matchingReviewReasonLabel(item.reasons[1]), 'Semantic review pending');
});

test('decision labels expose every immutable review choice', () => {
  assert.deepEqual(
    MATCHING_REVIEW_DECISIONS.map((choice) => matchingReviewDecisionLabel(choice.value)),
    ['Retain legacy', 'Accept shadow', 'Needs evidence'],
  );
});
