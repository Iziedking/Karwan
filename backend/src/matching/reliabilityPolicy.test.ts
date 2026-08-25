import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATCHING_RELIABILITY_POLICY_VERSION,
  minimumReliabilityForLane,
} from './reliabilityPolicy.js';
import { evaluateCandidate } from './engine.js';
import type { MatchingCandidateSnapshot, MatchingMandateSnapshot } from './types.js';

const candidate: MatchingCandidateSnapshot = {
  candidateId: 'seller-1',
  version: 1,
  kind: 'profile',
  sellerAgentAddress: '0x2222222222222222222222222222222222222222',
  lane: 'service',
  keywords: ['backend'],
  declaredSkills: ['backend'],
  transactionEvidence: [{
    source: 'karwan_onchain',
    completed: 8,
    disputed: 0,
    failed: 1,
    verified: true,
    evidenceId: 'reputation:seller-1:8:0:1',
  }],
  tier: 'strong',
  priceUsdc: '90',
  deadlineUnix: 1_500,
  capacityAvailable: true,
};

function mandate(lane: 'service' | 'finance'): MatchingMandateSnapshot {
  return {
    mandateId: `mandate-${lane}`,
    version: 1,
    ownerAddress: '0x1111111111111111111111111111111111111111',
    lane,
    budgetUsdc: '100',
    maxDeadlineUnix: 2_000,
    requiredKeywords: ['backend'],
    minimumReliability: minimumReliabilityForLane(lane),
    reliabilityPolicyVersion: MATCHING_RELIABILITY_POLICY_VERSION,
  };
}

test('lane policies are explicit and finance is stricter than service', () => {
  assert.equal(MATCHING_RELIABILITY_POLICY_VERSION, 'matching-reliability-v1');
  assert.equal(minimumReliabilityForLane('service'), 60);
  assert.equal(minimumReliabilityForLane('finance'), 80);
});

test('mandate reliability policy is enforced without a per-call override', () => {
  const service = evaluateCandidate({ mandate: mandate('service'), candidate, nowUnix: 1_000 });
  const finance = evaluateCandidate({
    mandate: { ...mandate('finance'), requiredKeywords: ['backend'] },
    candidate: { ...candidate, lane: 'finance' },
    nowUnix: 1_000,
  });
  assert.equal(service.reliabilityThreshold, 60);
  assert.equal(service.eligible, true);
  assert.equal(service.matchLabel, 'STRONG_MATCH');
  assert.equal(finance.reliabilityThreshold, 80);
  assert.equal(finance.eligible, true);
  assert.equal(finance.matchLabel, 'STRONG_MATCH');
});

test('profile mandate versions change when the explicit threshold changes', async () => {
  const { profileMandateVersion } = await import('./profileProjection.js');
  const base = {
    jobId: 'job-1', buyer: '0x1111111111111111111111111111111111111111', budgetUsdc: '100',
    deadlineUnix: 2_000, termsHash: 'terms', tradeLane: 'service' as const,
  };
  assert.notEqual(
    profileMandateVersion(base),
    profileMandateVersion({ ...base, minimumReliability: 80 }),
  );
});
