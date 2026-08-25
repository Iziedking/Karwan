import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateShadowRollout } from './gates.js';

const thresholds = { minimumObservations: 10, maximumStaleOfferAcceptances: 0 };
const clean = { observations: 10, matchingDivergences: 0, timerDivergences: 0, deadLetters: 0, leaseLosses: 0, duplicateCommandConflicts: 0, staleOfferAcceptances: 0, repeatedReengagements: 0 };

test('clean shadow evidence is eligible only after the minimum sample', () => {
  assert.deepEqual(evaluateShadowRollout(clean, thresholds), { eligible: true, reasons: [], killSwitch: false });
  assert.equal(evaluateShadowRollout({ ...clean, observations: 9 }, thresholds).killSwitch, true);
});

test('any unexplained divergence or duplicate safety failure kills the cutover', () => {
  const result = evaluateShadowRollout({ ...clean, matchingDivergences: 1, duplicateCommandConflicts: 1 }, thresholds);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, ['MATCHING_DIVERGENCE', 'COMMAND_IDEMPOTENCY_CONFLICT']);
});

test('uncertain evidence or settlement conflicts block rollout', () => {
  const result = evaluateShadowRollout({ ...clean, unknownEvidenceUsed: 1, evidenceSettlementConflicts: 1 }, thresholds);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, ['UNCERTAIN_EVIDENCE_USED', 'EVIDENCE_SETTLEMENT_CONFLICT']);
});

test('uncertain financial provider state blocks rollout', () => {
  const result = evaluateShadowRollout({ ...clean, uncertainFinancialStates: 1 }, {
    ...thresholds,
    maximumUncertainFinancialStates: 0,
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, ['UNCERTAIN_FINANCIAL_STATE']);
});

test('legacy winner false negatives block rollout even when other counters are clean', () => {
  const result = evaluateShadowRollout({ ...clean, matchingFalseNegativeReviews: 1 }, thresholds);
  assert.deepEqual(result.reasons, ['MATCHING_FALSE_NEGATIVE_REVIEW']);
  assert.equal(result.eligible, false);
});

test('unreviewed matching disagreements block rollout', () => {
  const result = evaluateShadowRollout({ ...clean, matchingReviewsPending: 1 }, thresholds);
  assert.deepEqual(result.reasons, ['MATCHING_REVIEW_PENDING']);
  assert.equal(result.eligible, false);
});

test('matching review that needs more evidence blocks rollout', () => {
  const result = evaluateShadowRollout({ ...clean, matchingReviewsNeedingEvidence: 1 }, thresholds);
  assert.deepEqual(result.reasons, ['MATCHING_REVIEW_NEEDS_EVIDENCE']);
  assert.equal(result.eligible, false);
});
