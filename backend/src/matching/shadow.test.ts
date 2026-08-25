import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMatchingAuditReviewQueue, InMemoryMatchingAuditStore } from './audit.js';
import { createMatchingShadowObserver } from './shadow.js';
import type { MatchingCandidateSnapshot, MatchingMandateSnapshot } from './types.js';

const mandate: MatchingMandateSnapshot = {
  mandateId: 'shadow-mandate',
  version: 1,
  ownerAddress: '0xbuyer',
  lane: 'service',
  budgetUsdc: '100',
  maxDeadlineUnix: 2_000,
  requiredKeywords: ['api'],
};

function candidate(id: string, priceUsdc: string): MatchingCandidateSnapshot {
  return {
    candidateId: id,
    version: 1,
    kind: 'profile',
    sellerAgentAddress: `0x${id}`,
    sellerOwnerAddress: `0xowner-${id}`,
    lane: 'service',
    keywords: ['api', 'backend'],
    priceUsdc,
    deadlineUnix: 1_500,
    capacityAvailable: true,
    tier: 'established',
  };
}

function ambiguousCandidate(id: string): MatchingCandidateSnapshot {
  return {
    ...candidate(id, '90'),
    keywords: ['settlement'],
    declaredSkills: ['backend'],
  };
}

function uncertainEvidenceCandidate(id: string): MatchingCandidateSnapshot {
  return {
    ...candidate(id, '90'),
    transactionEvidence: [{
      source: 'paid_x402',
      completed: 8,
      disputed: 0,
      failed: 0,
      fetchedAtUnix: 1_000,
      expiresAtUnix: 1_500,
      paymentStatus: 'UNKNOWN',
      verified: false,
      evidenceId: 'paid-passport:shadow',
    }],
  };
}

test('shadow observer stores deterministic ranking and legacy winner comparison', async () => {
  const store = new InMemoryMatchingAuditStore();
  const observe = createMatchingShadowObserver(store);
  await observe({
    source: 'buyer-bids',
    observationKey: 'shadow-1',
    mandate,
    candidates: [candidate('seller-a', '90'), candidate('seller-b', '100')],
    legacyCandidateIds: ['seller-a', 'seller-b'],
    nowUnix: 1_000,
  });
  const records = await store.list();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.comparisonStatus, 'matched');
  assert.deepEqual(records[0]?.shadowCandidateIds, ['seller-a', 'seller-b']);
  assert.equal((await store.summary()).comparison.diverged, 0);
  assert.equal((await store.summary()).semanticReviewCandidates, 0);
  const telemetry = (await store.summary()).telemetry;
  assert.equal(telemetry.latency.samples, 1);
  assert.equal(telemetry.latency.legacySamples, 0);
  assert.equal(telemetry.latency.shadowSamples, 1);
  assert.equal(telemetry.paidCalls.delta, null);
});

test('matching telemetry reports measured sides without turning missing paid-call data into zero', async () => {
  const store = new InMemoryMatchingAuditStore();
  await store.record({
    observationKey: 'telemetry-1',
    source: 'buyer-bids',
    mandateId: mandate.mandateId,
    mandateVersion: mandate.version,
    legacyCandidateIds: ['seller-a'],
    shadowCandidateIds: ['seller-a'],
    evaluations: [],
    telemetry: {
      legacyLatencyMs: 12.5,
      shadowLatencyMs: 4.5,
      legacyPaidCallCount: 2,
      shadowPaidCallCount: 0,
    },
    observedAt: 1_000,
  });
  await store.record({
    observationKey: 'telemetry-2',
    source: 'listing-brief',
    mandateId: mandate.mandateId,
    mandateVersion: mandate.version,
    legacyCandidateIds: ['seller-a'],
    shadowCandidateIds: ['seller-a'],
    evaluations: [],
    telemetry: { shadowLatencyMs: 2 },
    observedAt: 999,
  });
  const summary = await store.summary();
  assert.deepEqual(summary.telemetry, {
    latency: {
      samples: 2,
      legacySamples: 1,
      shadowSamples: 2,
      legacyTotalMs: 12.5,
      shadowTotalMs: 6.5,
      legacyAverageMs: 12.5,
      shadowAverageMs: 3.25,
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
  });
});

test('matching summary counts uncertain transaction evidence used by shadow evaluations', async () => {
  const store = new InMemoryMatchingAuditStore();
  const observe = createMatchingShadowObserver(store);
  await observe({
    source: 'buyer-bids',
    observationKey: 'shadow-uncertain-evidence',
    mandate,
    candidates: [uncertainEvidenceCandidate('seller-uncertain')],
    legacyCandidateIds: ['seller-uncertain'],
    nowUnix: 1_000,
  });

  const summary = await store.summary();
  assert.equal(summary.uncertainEvidenceUses, 1);
  assert.equal((await store.list())[0]?.evaluations[0]?.evidence.uncertainTransactionCount, 1);
});

test('shadow observer records divergence without changing the supplied legacy order', async () => {
  const store = new InMemoryMatchingAuditStore();
  const observe = createMatchingShadowObserver(store);
  const legacy = ['seller-b', 'seller-a'];
  await observe({
    source: 'listing-brief',
    observationKey: 'shadow-2',
    mandate,
    candidates: [candidate('seller-a', '90'), candidate('seller-b', '100')],
    legacyCandidateIds: legacy,
    nowUnix: 1_000,
  });
  assert.deepEqual(legacy, ['seller-b', 'seller-a']);
  assert.equal((await store.summary()).comparison.diverged, 1);
  assert.equal((await store.summary()).falseNegativeReviews, 0);
});

test('shadow summary isolates legacy winners absent from the shadow candidate set', async () => {
  const store = new InMemoryMatchingAuditStore();
  await store.record({
    observationKey: 'shadow-false-negative',
    source: 'buyer-bids',
    mandateId: mandate.mandateId,
    mandateVersion: mandate.version,
    legacyCandidateIds: ['seller-a'],
    shadowCandidateIds: ['seller-b'],
    evaluations: [],
    observedAt: 1_000,
  });
  assert.equal((await store.summary()).falseNegativeReviews, 1);
});

test('duplicate shadow observations are idempotent and conflicts are rejected', async () => {
  const store = new InMemoryMatchingAuditStore();
  const observe = createMatchingShadowObserver(store);
  const observation = {
    source: 'buyer-bids' as const,
    observationKey: 'shadow-3',
    mandate,
    candidates: [candidate('seller-a', '90')],
    legacyCandidateIds: ['seller-a'],
    nowUnix: 1_000,
  };
  await observe(observation);
  await observe(observation);
  assert.equal((await store.summary()).total, 1);
  await assert.rejects(
    () => observe({ ...observation, legacyCandidateIds: [] }),
    /matching audit conflict/,
  );
});

test('duplicate candidate snapshots are evaluated once in the shadow audit', async () => {
  const store = new InMemoryMatchingAuditStore();
  const observe = createMatchingShadowObserver(store);
  await observe({
    source: 'buyer-bids',
    observationKey: 'shadow-duplicate-candidates',
    mandate,
    candidates: [candidate('seller-a', '90'), candidate('seller-a', '90')],
    legacyCandidateIds: ['seller-a'],
    nowUnix: 1_000,
  });

  const records = await store.list();
  assert.equal(records[0]?.evaluations.length, 1);
  assert.deepEqual(records[0]?.shadowCandidateIds, ['seller-a']);
});

test('shadow audit records only deduped ambiguous semantic-review pointers', async () => {
  const store = new InMemoryMatchingAuditStore();
  const observe = createMatchingShadowObserver(store);
  await observe({
    source: 'buyer-bids',
    observationKey: 'shadow-semantic-review',
    mandate,
    candidates: [
      ambiguousCandidate('seller-semantic'),
      ambiguousCandidate('seller-semantic'),
      candidate('seller-eligible', '95'),
      candidate('seller-over-cap', '150'),
    ],
    legacyCandidateIds: ['seller-eligible'],
    nowUnix: 1_000,
  });

  const record = (await store.list())[0]!;
  assert.deepEqual(record.semanticReviewCandidates, [
    { candidateId: 'seller-semantic', candidateVersion: 1 },
  ]);
  assert.equal((await store.summary()).semanticReviewCandidates, 1);
  assert.equal(record.evaluations.length, 3);
});

test('matching review queue identifies divergences, false negatives, and pending semantic work', async () => {
  const store = new InMemoryMatchingAuditStore();
  await store.record({
    observationKey: 'review-queue-divergence',
    source: 'buyer-bids',
    mandateId: mandate.mandateId,
    mandateVersion: mandate.version,
    legacyCandidateIds: ['seller-a'],
    shadowCandidateIds: ['seller-b'],
    evaluations: [],
    observedAt: 2_000,
  });
  await store.record({
    observationKey: 'review-queue-semantic',
    source: 'listing-brief',
    mandateId: mandate.mandateId,
    mandateVersion: mandate.version,
    legacyCandidateIds: ['seller-b'],
    shadowCandidateIds: ['seller-b'],
    evaluations: [],
    semanticReviewCandidates: [{ candidateId: 'seller-c', candidateVersion: 1 }],
    observedAt: 1_000,
  });
  const queue = buildMatchingAuditReviewQueue(await store.list(), 10);
  assert.deepEqual(queue.map((item) => [item.observationKey, item.reasons]), [
    ['review-queue-divergence', ['winner-divergence', 'false-negative']],
    ['review-queue-semantic', ['semantic-review-pending']],
  ]);
});
