import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShadowRolloutReport } from './report.js';

const thresholds = {
  minimumObservations: 10,
  maximumStaleOfferAcceptances: 0,
  maximumUnknownEvidenceUsed: 0,
  maximumEvidenceSettlementConflicts: 0,
  maximumUncertainFinancialStates: 0,
};

const cleanSources = {
  matching: {
    total: 4,
    bySource: { 'buyer-bids': 4, 'listing-brief': 0 },
    comparison: { matched: 4, diverged: 0 },
    falseNegativeReviews: 0,
    uncertainEvidenceUses: 0,
  },
  parity: {
    total: 3,
    byKind: { collection: 2, 'counter-timeout': 1 },
    comparison: { pending: 0, matched: 3, diverged: 0 },
    task: { pending: 0, 'awaiting-planner': 0, matched: 3, 'stale-suppressed': 0, diverged: 0 },
  },
  negotiation: { total: 3, byState: { succeeded: 3 }, checkpointed: 3, rejected: 0 },
  negotiationCommands: { total: 3, staleOfferAcceptances: 0, duplicateCommandConflicts: 0 },
  matchingReviewCoverage: {
    queueCount: 0,
    reviewedCount: 0,
    pendingCount: 0,
    needsMoreEvidenceCount: 0,
    byDecision: { retain_legacy: 0, accept_shadow: 0, needs_more_evidence: 0 },
    scanComplete: true,
  },
  evidence: {
    needs: 2,
    purchases: 2,
    blockers: 0,
    unknownPurchases: 0,
    openBlockers: 0,
    settlementConflicts: 0,
  },
  financial: {
    total: 3,
    authorized: 1,
    approvalRequired: 1,
    rejected: 1,
    created: 0,
    submitted: 0,
    unknown: 0,
    reconciling: 0,
    settled: 0,
    failed: 0,
  },
  tasks: {
    total: 3,
    byState: { pending: 0, leased: 0, running: 0, waiting: 0, failed: 0, succeeded: 3, dead_letter: 0, cancelled: 0 },
    retrying: 0,
    deadLettered: 0,
    leaseLosses: 0,
    repeatedReengagements: 0,
  },
};

test('rollout report is eligible when every required telemetry source is complete', () => {
  const report = buildShadowRolloutReport(cleanSources, thresholds);
  assert.equal(report.metrics.observations, 10);
  assert.equal(report.metricsComplete, true);
  assert.equal(report.gate.eligible, true);
  assert.equal(report.gate.killSwitch, false);
  assert.deepEqual(report.gate.reasons, []);
  assert.equal(report.missingMetrics.includes('tasks.leaseLosses'), false);
  assert.equal(report.matchingTelemetry, null);
});

test('rollout report exposes measured matching latency and paid-call delta without inventing missing values', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matching: {
      ...cleanSources.matching,
      telemetry: {
        latency: {
          samples: 2,
          legacySamples: 2,
          shadowSamples: 2,
          legacyTotalMs: 20,
          shadowTotalMs: 8,
          legacyAverageMs: 10,
          shadowAverageMs: 4,
        },
        paidCalls: {
          samples: 1,
          pairedSamples: 1,
          legacySamples: 1,
          shadowSamples: 1,
          legacyTotal: 2,
          shadowTotal: 0,
          delta: -2,
        },
      },
    },
  }, thresholds);
  assert.equal(report.matchingTelemetry?.latency.shadowAverageMs, 4);
  assert.equal(report.matchingTelemetry?.paidCalls.delta, -2);
});

test('matching or timer divergence remains visible when telemetry is complete', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matching: {
      ...cleanSources.matching,
      comparison: { matched: 3, diverged: 1 },
    },
    parity: {
      ...cleanSources.parity,
      comparison: { pending: 0, matched: 2, diverged: 1 },
    },
  }, thresholds);
  assert.deepEqual(report.gate.reasons, [
    'MATCHING_DIVERGENCE',
    'TIMER_DIVERGENCE',
  ]);
  assert.equal(report.metrics.matchingDivergences, 1);
  assert.equal(report.metrics.timerDivergences, 1);
});

test('pending semantic review remains a cutover blocker', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matching: { ...cleanSources.matching, semanticReviewCandidates: 2 },
  }, thresholds);
  assert.equal(report.metrics.semanticReviewsPending, 2);
  assert.ok(report.gate.reasons.includes('SEMANTIC_REVIEW_PENDING'));
  assert.equal(report.gate.eligible, false);
});

test('legacy winners missing from the shadow set remain a cutover blocker', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matching: { ...cleanSources.matching, falseNegativeReviews: 1 },
  }, thresholds);
  assert.equal(report.metrics.matchingFalseNegativeReviews, 1);
  assert.ok(report.gate.reasons.includes('MATCHING_FALSE_NEGATIVE_REVIEW'));
  assert.equal(report.gate.eligible, false);
});

test('matching review coverage is reported and unresolved queue items block cutover', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matchingReviewCoverage: {
      queueCount: 2,
      reviewedCount: 1,
      pendingCount: 1,
      needsMoreEvidenceCount: 0,
      byDecision: { retain_legacy: 1, accept_shadow: 0, needs_more_evidence: 0 },
      scanComplete: true,
    },
  }, thresholds);
  assert.equal(report.metrics.matchingReviewsPending, 1);
  assert.equal(report.metrics.matchingReviewsNeedingEvidence, 0);
  assert.equal(report.matchingReviewCoverage?.reviewedCount, 1);
  assert.ok(report.gate.reasons.includes('MATCHING_REVIEW_PENDING'));
  assert.equal(report.missingMetrics.includes('matching.reviews'), false);
});

test('missing matching review coverage fails closed instead of authorizing cutover', () => {
  const { matchingReviewCoverage: _matchingReviewCoverage, ...sourcesWithoutReviews } = cleanSources;
  const report = buildShadowRolloutReport(sourcesWithoutReviews, thresholds);
  assert.equal(report.metricsComplete, false);
  assert.ok(report.missingMetrics.includes('matching.reviews'));
  assert.ok(report.gate.reasons.includes('METRICS_INCOMPLETE'));
  assert.equal(report.gate.eligible, false);
});

test('bounded matching review coverage fails closed when the window is incomplete', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matchingReviewCoverage: {
      queueCount: 2,
      reviewedCount: 2,
      pendingCount: 0,
      needsMoreEvidenceCount: 0,
      byDecision: { retain_legacy: 1, accept_shadow: 1, needs_more_evidence: 0 },
      scanComplete: false,
    },
  }, thresholds);
  assert.equal(report.metricsComplete, false);
  assert.ok(report.missingMetrics.includes('matching.reviews.window'));
  assert.ok(report.gate.reasons.includes('METRICS_INCOMPLETE'));
});

test('needs-more-evidence review remains a rollout blocker after the queue is reviewed', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matchingReviewCoverage: {
      queueCount: 1,
      reviewedCount: 1,
      pendingCount: 0,
      needsMoreEvidenceCount: 1,
      byDecision: { retain_legacy: 0, accept_shadow: 0, needs_more_evidence: 1 },
      scanComplete: true,
    },
  }, thresholds);
  assert.equal(report.metrics.matchingReviewsPending, 0);
  assert.equal(report.metrics.matchingReviewsNeedingEvidence, 1);
  assert.ok(report.gate.reasons.includes('MATCHING_REVIEW_NEEDS_EVIDENCE'));
  assert.equal(report.gate.eligible, false);
});

test('unknown evidence is conservatively treated as a cutover blocker', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    evidence: { ...cleanSources.evidence, unknownPurchases: 1 },
  }, thresholds);
  assert.equal(report.metrics.unknownEvidenceUsed, 1);
  assert.ok(report.gate.reasons.includes('UNCERTAIN_EVIDENCE_USED'));
  assert.equal(report.gate.eligible, false);
});

test('uncertain transaction evidence in matching evaluations is a cutover blocker', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matching: { ...cleanSources.matching, uncertainEvidenceUses: 1 },
  }, thresholds);
  assert.equal(report.metrics.unknownEvidenceUsed, 1);
  assert.ok(report.gate.reasons.includes('UNCERTAIN_EVIDENCE_USED'));
  assert.equal(report.gate.eligible, false);
});

test('matching uncertainty coverage fails closed when the new counter is absent', () => {
  const { uncertainEvidenceUses: _uncertainEvidenceUses, ...legacyMatching } = cleanSources.matching;
  const report = buildShadowRolloutReport({
    ...cleanSources,
    matching: legacyMatching,
  }, thresholds);
  assert.equal(report.metricsComplete, false);
  assert.ok(report.missingMetrics.includes('matching.uncertainEvidenceUses'));
  assert.ok(report.gate.reasons.includes('METRICS_INCOMPLETE'));
  assert.equal(report.gate.eligible, false);
});

test('settled evidence without a fresh snapshot remains a cutover blocker', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    evidence: { ...cleanSources.evidence, settlementConflicts: 1 },
  }, thresholds);
  assert.equal(report.metrics.evidenceSettlementConflicts, 1);
  assert.ok(report.gate.reasons.includes('EVIDENCE_SETTLEMENT_CONFLICT'));
  assert.equal(report.gate.eligible, false);
});

test('unknown or reconciling financial commands block rollout', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    financial: { ...cleanSources.financial, unknown: 1, reconciling: 1 },
  }, thresholds);
  assert.equal(report.metrics.uncertainFinancialStates, 2);
  assert.ok(report.gate.reasons.includes('UNCERTAIN_FINANCIAL_STATE'));
  assert.equal(report.gate.eligible, false);
});

test('durable stale acceptance telemetry is included without inventing other counters', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    negotiationCommands: { total: 4, staleOfferAcceptances: 2 },
  }, thresholds);
  assert.equal(report.metrics.staleOfferAcceptances, 2);
  assert.ok(report.gate.reasons.includes('STALE_ACCEPTANCE_RATE_TOO_HIGH'));
  assert.equal(report.missingMetrics.includes('negotiation.duplicateCommandConflicts'), false);
  assert.equal(report.missingMetrics.includes('negotiation.staleOfferAcceptances'), false);
});

test('durable duplicate re-engagement telemetry remains a cutover blocker', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    tasks: { ...cleanSources.tasks, repeatedReengagements: 2 },
  }, thresholds);
  assert.equal(report.metrics.repeatedReengagements, 2);
  assert.ok(report.gate.reasons.includes('REPEATED_REENGAGEMENT'));
  assert.equal(report.missingMetrics.includes('negotiation.repeatedReengagements'), false);
});

test('durable command conflicts remain a cutover blocker', () => {
  const report = buildShadowRolloutReport({
    ...cleanSources,
    negotiationCommands: { ...cleanSources.negotiationCommands, duplicateCommandConflicts: 1 },
  }, thresholds);
  assert.equal(report.metrics.duplicateCommandConflicts, 1);
  assert.ok(report.gate.reasons.includes('COMMAND_IDEMPOTENCY_CONFLICT'));
});
