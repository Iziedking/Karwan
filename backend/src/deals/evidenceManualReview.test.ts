import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { manualReviewActive, manualReviewEligibility } from './evidenceManualReview.js';
import { releaseBlockReasonForDelivery } from './releaseBlock.js';
import { milestoneWindowAnchor } from './releaseWindow.js';

const HOUR = 3_600_000;
const DELIVERED = 1_789_000_000_000;

function deal(patch: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: `0x${'ab'.repeat(32)}`,
    buyer: `0x${'11'.repeat(20)}`,
    seller: `0x${'22'.repeat(20)}`,
    dealAmountUsdc: '100',
    firstReleasePct: 50,
    terms: 'Deliver the release',
    createdAt: DELIVERED - HOUR,
    evidenceRequired: true,
    delivered: true,
    deliveredAt: DELIVERED,
    deliveryRevision: 1,
    agreementVersion: 1,
    ...patch,
  } as DirectDeal;
}

test('a check that has not answered within the stall window cannot be skipped yet', () => {
  assert.deepEqual(
    manualReviewEligibility(deal(), 'not-recorded', DELIVERED + HOUR - 1, HOUR),
    { eligible: false, reason: 'still-checking' },
  );
});

test('a check silent past the stall window, expired, or failed to publish can be skipped', () => {
  assert.equal(manualReviewEligibility(deal(), 'not-recorded', DELIVERED + HOUR, HOUR).eligible, true);
  const expired = deal({
    creDeliveryRequest: { expiresAt: Math.floor(DELIVERED / 1000) + 60, publishedAt: DELIVERED } as DirectDeal['creDeliveryRequest'],
  });
  assert.equal(manualReviewEligibility(expired, 'not-recorded', DELIVERED + 2 * 60_000, HOUR).eligible, true);
  const failed = deal({ creAutoPublication: { revision: 1, attempts: 3, nextAttemptAt: 0, error: 'publish-unavailable' } });
  assert.equal(manualReviewEligibility(failed, undefined, DELIVERED + 1, HOUR).eligible, true);
});

test('an answered check, a security hold, or a closed deal is never skippable', () => {
  const late = DELIVERED + 10 * HOUR;
  assert.deepEqual(manualReviewEligibility(deal(), 'pass', late, HOUR), { eligible: false, reason: 'answered' });
  assert.deepEqual(manualReviewEligibility(deal(), 'mismatch', late, HOUR), { eligible: false, reason: 'answered' });
  assert.deepEqual(
    manualReviewEligibility(deal({ verificationStatus: 'malicious' }), 'not-recorded', late, HOUR),
    { eligible: false, reason: 'security-hold' },
  );
  assert.deepEqual(
    manualReviewEligibility(deal({ settledAt: late }), 'not-recorded', late, HOUR),
    { eligible: false, reason: 'closed' },
  );
  assert.deepEqual(
    manualReviewEligibility(deal({ evidenceRequired: false }), 'not-recorded', late, HOUR),
    { eligible: false, reason: 'not-required' },
  );
});

test('a manual review binds to the delivery and agreement it was given for', () => {
  const review = { by: `0x${'11'.repeat(20)}`, at: DELIVERED + 2 * HOUR, deliveryRevision: 1, agreementVersion: 1 };
  assert.equal(manualReviewActive(deal({ evidenceManualReview: review })), true);
  assert.equal(manualReviewActive(deal({ evidenceManualReview: review, deliveryRevision: 2 })), false);
  assert.equal(manualReviewActive(deal({ evidenceManualReview: review, agreementVersion: 2 })), false);
});

test('manual review lifts only the no-answer block', () => {
  assert.equal(
    releaseBlockReasonForDelivery({ evidenceRequired: true, evidenceReceipt: { state: 'not-recorded' }, manualReview: true }),
    null,
  );
  assert.equal(
    releaseBlockReasonForDelivery({ evidenceRequired: true, evidenceReceipt: { state: 'mismatch' }, manualReview: true }),
    'requirement-mismatch',
  );
  assert.equal(
    releaseBlockReasonForDelivery({ evidenceRequired: true, verificationStatus: 'suspicious', manualReview: true }),
    'security-hold',
  );
  assert.equal(
    releaseBlockReasonForDelivery({ deliveryMatch: { verdict: 'mismatch' }, manualReview: true }),
    'requirement-mismatch',
  );
});

test('taking over the review restarts the first window instead of paying out a week-old delivery', () => {
  const reviewedAt = DELIVERED + 7 * 24 * HOUR;
  const reviewed = deal({
    evidenceManualReview: { by: `0x${'11'.repeat(20)}`, at: reviewedAt, deliveryRevision: 1, agreementVersion: 1 },
  });
  assert.equal(milestoneWindowAnchor(reviewed, 0), reviewedAt);
  assert.equal(milestoneWindowAnchor(deal(), 0), DELIVERED);
  const stale = { ...reviewed, deliveryRevision: 2 } as DirectDeal;
  assert.equal(milestoneWindowAnchor(stale, 0), DELIVERED);
});
