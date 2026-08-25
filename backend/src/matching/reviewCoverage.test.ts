import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMatchingReviewCoverage } from './reviewCoverage.js';

const queue = [
  {
    observationKey: 'observation-1', source: 'buyer-bids' as const, mandateId: 'mandate-1',
    mandateVersion: 1, observedAt: 200, reasons: ['winner-divergence' as const],
  },
  {
    observationKey: 'observation-2', source: 'listing-brief' as const, mandateId: 'mandate-2',
    mandateVersion: 1, observedAt: 100, reasons: ['false-negative' as const],
  },
];

test('coverage joins dispositions by immutable observation key and counts pending work', () => {
  const coverage = buildMatchingReviewCoverage({
    queue,
    reviews: [{
      reviewId: 'review-1', observationKey: 'observation-1', decision: 'retain_legacy',
      reviewer: 'admin', createdAt: 300,
    }],
  });
  assert.deepEqual(coverage, {
    queueCount: 2,
    reviewedCount: 1,
    pendingCount: 1,
    needsMoreEvidenceCount: 0,
    byDecision: { retain_legacy: 1, accept_shadow: 0, needs_more_evidence: 0 },
    scanComplete: true,
  });
});

test('coverage ignores dispositions for observations outside the queue', () => {
  const coverage = buildMatchingReviewCoverage({
    queue,
    reviews: [{
      reviewId: 'review-outside', observationKey: 'other-observation', decision: 'accept_shadow',
      reviewer: 'admin', createdAt: 300,
    }],
  });
  assert.equal(coverage.reviewedCount, 0);
  assert.equal(coverage.pendingCount, 2);
  assert.equal(coverage.needsMoreEvidenceCount, 0);
  assert.deepEqual(coverage.byDecision, { retain_legacy: 0, accept_shadow: 0, needs_more_evidence: 0 });
});

test('coverage exposes bounded audit windows as incomplete', () => {
  const coverage = buildMatchingReviewCoverage({ queue, reviews: [], scanComplete: false });
  assert.equal(coverage.scanComplete, false);
});

test('needs-more-evidence dispositions remain unresolved for rollout purposes', () => {
  const coverage = buildMatchingReviewCoverage({
    queue: [queue[0]!],
    reviews: [{
      reviewId: 'review-needs-evidence',
      observationKey: queue[0]!.observationKey,
      decision: 'needs_more_evidence',
      reviewer: 'operator',
      createdAt: 400,
    }],
  });
  assert.equal(coverage.reviewedCount, 1);
  assert.equal(coverage.pendingCount, 0);
  assert.equal(coverage.needsMoreEvidenceCount, 1);
  assert.equal(coverage.byDecision.needs_more_evidence, 1);
});
