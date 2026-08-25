import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSemanticEvaluationRequest,
  parseSemanticEvaluationResponse,
  planSemanticEvaluations,
  resolveSemanticEvaluation,
} from './semanticEvaluator.js';
import type { MatchingEvaluationInput, MatchingMandateSnapshot, MatchingCandidateSnapshot } from './types.js';

const mandate: MatchingMandateSnapshot = {
  mandateId: 'semantic-mandate',
  version: 4,
  ownerAddress: '0xbuyer',
  lane: 'service',
  budgetUsdc: '100',
  maxDeadlineUnix: 2_000,
  requiredKeywords: ['payment orchestration', 'backend'],
};

function candidate(overrides: Partial<MatchingCandidateSnapshot> = {}): MatchingCandidateSnapshot {
  return {
    candidateId: 'semantic-candidate',
    version: 2,
    kind: 'profile',
    sellerAgentAddress: '0xseller-agent',
    sellerOwnerAddress: '0xseller-owner',
    lane: 'service',
    title: 'Payments engineer',
    description: 'Builds settlement systems',
    keywords: ['settlement', 'systems'],
    // Declared skills are available as semantic evidence but do not affect
    // the deterministic lexical ambiguity gate, which only uses keywords.
    declaredSkills: ['payments', 'backend'],
    priceUsdc: '90',
    deadlineUnix: 1_500,
    capacityAvailable: true,
    ...overrides,
  };
}

function input(overrides: Partial<MatchingEvaluationInput> = {}): MatchingEvaluationInput {
  return { mandate, candidate: candidate(), nowUnix: 1_000, ...overrides };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'semantic-candidate',
    candidateVersion: 2,
    mandateVersion: 4,
    decision: 'MATCH' as const,
    confidence: 0.92,
    capabilityIds: ['cap:backend'],
    requirementCoverage: [
      { requirementId: 'req-1', coverage: 'STRONG', evidenceIds: ['declared:backend'] },
      { requirementId: 'req-2', coverage: 'STRONG', evidenceIds: ['declared:backend'] },
      { requirementId: 'req-3', coverage: 'STRONG', evidenceIds: ['declared:backend'] },
    ],
    risks: [],
    reasonCodes: ['SEMANTIC_ROLE_EQUIVALENCE'],
    reason: 'The candidate description supports the requested backend work.',
    ...overrides,
  };
}

test('semantic requests are created only for hard-filter-passing ambiguous candidates', () => {
  const request = buildSemanticEvaluationRequest(input());
  assert.deepEqual(request, {
    candidateId: 'semantic-candidate',
    candidateVersion: 2,
    mandateVersion: 4,
    requirements: [
      { requirementId: 'req-1', label: 'backend' },
      { requirementId: 'req-2', label: 'orchestration' },
      { requirementId: 'req-3', label: 'payment' },
    ],
    capabilities: [
      { capabilityId: 'cap:backend', label: 'backend', evidenceIds: ['declared:backend'] },
      { capabilityId: 'cap:payments', label: 'payments', evidenceIds: ['declared:payments'] },
      { capabilityId: 'cap:settlement', label: 'settlement', evidenceIds: ['declared:settlement'] },
      { capabilityId: 'cap:systems', label: 'systems', evidenceIds: ['declared:systems'] },
    ],
    allowedCapabilityIds: ['cap:backend', 'cap:payments', 'cap:settlement', 'cap:systems'],
    allowedEvidenceIds: ['declared:backend', 'declared:payments', 'declared:settlement', 'declared:systems'],
    candidate: {
      title: 'Payments engineer',
      description: 'Builds settlement systems',
      keywords: ['settlement', 'systems'],
      declaredSkills: ['payments', 'backend'],
    },
  });

  assert.equal(
    buildSemanticEvaluationRequest(input({ candidate: candidate({ priceUsdc: '150' }) })),
    null,
  );
});

test('semantic planning deduplicates snapshots and excludes hard-filter failures', () => {
  const planned = planSemanticEvaluations([
    input(),
    input(),
    input({ candidate: candidate({ version: 3 }) }),
    input({ candidate: candidate({ version: 4, priceUsdc: '150' }) }),
  ]);
  assert.deepEqual(
    planned.map((item) => [item.candidateId, item.candidateVersion, item.mandateVersion]),
    [
      ['semantic-candidate', 2, 4],
      ['semantic-candidate', 3, 4],
    ],
  );
  assert.equal(planned.every((item) => item.request.candidateId === item.candidateId), true);
});

test('semantic responses reject unknown fields and malformed confidence', () => {
  assert.throws(() => parseSemanticEvaluationResponse({ ...response(), unknown: true }), /Unrecognized key/);
  assert.throws(() => parseSemanticEvaluationResponse({ ...response(), confidence: 2 }), /less than or equal to 1/);
});

test('valid semantic acceptance resolves ambiguity without raising deterministic score', () => {
  const base = resolveSemanticEvaluation(input(), response());
  assert.equal(base.decision, 'eligible');
  assert.equal(base.eligible, true);
  assert.equal(base.score, 0);
  assert.equal(base.matchLabel, 'POSSIBLE_MATCH');
  assert.equal(base.semantic?.decision, 'accepted');
  assert.ok(base.reasons.includes('MATCH_ELIGIBLE'));
  assert.equal(base.reasons.includes('SEMANTIC_EVALUATION_REQUIRED'), false);
});

test('low confidence and explicit rejection stay non-eligible', () => {
  const low = resolveSemanticEvaluation(input(), response({ confidence: 0.4 }));
  assert.equal(low.decision, 'ambiguous');
  assert.equal(low.eligible, false);
  assert.ok(low.reasons.includes('SEMANTIC_CONFIDENCE_TOO_LOW'));

  const rejected = resolveSemanticEvaluation(input(), response({ decision: 'NO_MATCH' }));
  assert.equal(rejected.decision, 'rejected');
  assert.equal(rejected.eligible, false);
  assert.ok(rejected.reasons.includes('SEMANTIC_EVALUATION_REJECTED'));
});

test('semantic output cannot apply to another version or invent a required term', () => {
  assert.throws(
    () => resolveSemanticEvaluation(input(), response({ candidateVersion: 3 })),
    /identity mismatch/,
  );
  assert.throws(
    () => resolveSemanticEvaluation(input(), response({ capabilityIds: ['cap:unrelated'] })),
    /invented capability/,
  );
});

test('hard rejection remains authoritative even if a model says accept', () => {
  const result = resolveSemanticEvaluation(
    input({ candidate: candidate({ sellerOwnerAddress: '0xbuyer' }) }),
    response(),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.eligible, false);
  assert.equal(result.semantic, undefined);
});

test('semantic acceptance cannot bypass a failed evidence reliability threshold', () => {
  const result = resolveSemanticEvaluation(
    input({
      minimumReliability: 95,
      candidate: candidate({ keywords: ['rust'], declaredSkills: ['rust'] }),
    }),
    response({
      decision: 'MATCH',
      confidence: 0.99,
      requirementCoverage: [
        { requirementId: 'req-1', coverage: 'STRONG', evidenceIds: ['declared:rust'] },
        { requirementId: 'req-2', coverage: 'STRONG', evidenceIds: ['declared:rust'] },
        { requirementId: 'req-3', coverage: 'STRONG', evidenceIds: ['declared:rust'] },
      ],
      capabilityIds: ['cap:rust'],
    }),
  );
  assert.equal(result.decision, 'ambiguous');
  assert.equal(result.eligible, false);
  assert.equal(result.semantic?.decision, 'accepted');
  assert.equal(result.matchLabel, 'POSSIBLE_MATCH');
  assert.ok(result.reasons.includes('RELIABILITY_BELOW_THRESHOLD'));
});
