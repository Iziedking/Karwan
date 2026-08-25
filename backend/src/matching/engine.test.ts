import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMatchLabel, dedupeCandidateInputs, evaluateCandidate, evaluateCandidates, rankCandidates } from './engine.js';
import { parseUsdcMicro } from './money.js';
import { skillCoverage } from './taxonomy.js';
import type { MatchingCandidateSnapshot, MatchingEvaluationInput, MatchingMandateSnapshot } from './types.js';

const mandate: MatchingMandateSnapshot = {
  mandateId: 'mandate-1',
  version: 3,
  ownerAddress: '0xbuyer',
  agentAddress: '0xbuyer-agent',
  lane: 'service',
  budgetUsdc: '100.00',
  maxBudgetUsdc: '110.00',
  maxDeadlineUnix: 2_000,
  minDeadlineUnix: 1_100,
  requiredKeywords: ['API service', 'backend'],
  relationshipDealsBySeller: { '0xseller-good': 2 },
};

function candidate(overrides: Partial<MatchingCandidateSnapshot> = {}): MatchingCandidateSnapshot {
  return {
    candidateId: 'candidate-1',
    version: 1,
    kind: 'profile',
    sellerAgentAddress: '0xseller-good',
    sellerOwnerAddress: '0xseller-owner',
    lane: 'service',
    partyKind: 'person',
    title: 'Backend engineer',
    description: 'Builds reliable APIs',
    keywords: ['api', 'backend', 'engineer'],
    declaredSkills: ['backend', 'api'],
    skillEvidence: [{ skillId: 'backend', status: 'verified', evidenceId: 'skill-1', expiresAtUnix: 5_000 }],
    transactionEvidence: [{
      source: 'karwan_settled',
      completed: 8,
      disputed: 0,
      failed: 1,
      verified: true,
      evidenceId: 'tx-1',
      expiresAtUnix: 5_000,
    }],
    tier: 'strong',
    reputationBps: 8_000,
    priceUsdc: '100.00',
    deadlineUnix: 1_500,
    capacityAvailable: true,
    ...overrides,
  };
}

function input(overrides: Partial<MatchingEvaluationInput> = {}): MatchingEvaluationInput {
  return { mandate, candidate: candidate(), nowUnix: 1_000, ...overrides };
}

test('money parsing is exact to six decimal places', () => {
  assert.equal(parseUsdcMicro('100.1'), 100_100_000n);
  assert.equal(parseUsdcMicro('0.000001'), 1n);
  assert.throws(() => parseUsdcMicro('1.0000001'), /invalid USDC amount/);
});

test('taxonomy coverage is deterministic and ignores commerce filler', () => {
  assert.equal(skillCoverage(['API service', 'backend'], ['backend engineer', 'rest api']), 100);
  assert.equal(skillCoverage(['amazon account'], ['outlier account']), 0);
});

test('eligible candidates preserve declared and verified evidence separately', () => {
  const result = evaluateCandidate(input());
  assert.equal(result.decision, 'eligible');
  assert.equal(result.eligible, true);
  assert.equal(result.matchLabel, 'POSSIBLE_MATCH');
  assert.equal(result.score > 0, true);
  assert.deepEqual(result.evidence.declaredSkillIds, ['api', 'backend']);
  assert.deepEqual(result.evidence.verifiedSkillIds, ['backend']);
  assert.ok(result.reasons.includes('SKILL_VERIFIED'));
  assert.ok(result.reasons.includes('MATCH_ELIGIBLE'));
  assert.equal(result.engineVersion, 'matching-v2.0.0');
  assert.equal(result.deterministicSeed.length, 64);
});

test('deterministic seed is structured so delimiter-collision identities stay distinct', () => {
  const first = evaluateCandidate(input({
    mandate: { ...mandate, mandateId: 'mandate|1' },
    candidate: candidate({ candidateId: 'candidate', version: 2 }),
  }));
  const second = evaluateCandidate(input({
    mandate: { ...mandate, mandateId: 'mandate' },
    candidate: candidate({ candidateId: '1|candidate', version: 2 }),
  }));

  assert.notEqual(first.deterministicSeed, second.deterministicSeed);
});

test('hard filters reject self-dealing, wrong lane, expired, and over-cap candidates', () => {
  const result = evaluateCandidate(input({
    candidate: candidate({
      sellerOwnerAddress: '0xbuyer',
      lane: 'finance',
      expiresAtUnix: 999,
      priceUsdc: '120.00',
    }),
  }));
  assert.equal(result.decision, 'rejected');
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('SELF_DEALING'));
  assert.ok(result.reasons.includes('LANE_MISMATCH'));
  assert.ok(result.reasons.includes('EXPIRED_CANDIDATE'));
  assert.ok(result.reasons.includes('PRICE_OVER_CAP'));
});

test('over-cap but crossable candidates are near misses, not eligible matches', () => {
  const result = evaluateCandidate(input({ candidate: candidate({ priceUsdc: '120.00' }) }));
  assert.equal(result.decision, 'near_miss');
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('NEAR_MISS_WITHIN_STRETCH'));
});

test('ambiguous skill fit is held for semantic evaluation instead of being accepted', () => {
  const result = evaluateCandidate(input({
    candidate: candidate({ keywords: ['rust', 'embedded'], declaredSkills: ['embedded'] }),
  }));
  assert.equal(result.decision, 'ambiguous');
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('NO_SKILL_COVERAGE'));
  assert.ok(result.reasons.includes('SEMANTIC_EVALUATION_REQUIRED'));
});

test('uncertain paid evidence cannot increase reliability', () => {
  const uncertain = evaluateCandidate(input({
    candidate: candidate({
      transactionEvidence: [{
        source: 'paid_x402',
        completed: 100,
        disputed: 0,
        failed: 0,
        verified: true,
        paymentStatus: 'UNKNOWN',
        evidenceId: 'pending-payment',
      }],
    }),
  }));
  const settled = evaluateCandidate(input({
    candidate: candidate({
      transactionEvidence: [{
        source: 'paid_x402',
        completed: 100,
        disputed: 0,
        failed: 0,
        verified: true,
        paymentStatus: 'SETTLED',
        evidenceId: 'settled-payment',
      }],
    }),
  }));
  assert.equal(uncertain.evidence.reliableTransactionCount, 0);
  assert.equal(uncertain.evidence.uncertainTransactionCount, 1);
  assert.equal(uncertain.evidence.reliabilityScore, 50);
  assert.equal(settled.evidence.reliabilityScore, 100);
  assert.ok(uncertain.reasons.includes('EVIDENCE_UNCERTAIN'));
  assert.equal(uncertain.matchLabel, 'EVIDENCE_PENDING');
  assert.equal(settled.matchLabel, 'POSSIBLE_MATCH');
});

test('settled provider-only totals without an evidence reference remain uncertain', () => {
  const result = evaluateCandidate(input({
    candidate: candidate({
      transactionEvidence: [{
        source: 'paid_x402', completed: 100, disputed: 0, failed: 0,
        verified: true, paymentStatus: 'SETTLED',
      }],
    }),
  }));
  assert.equal(result.evidence.reliableTransactionCount, 0);
  assert.equal(result.evidence.uncertainTransactionCount, 1);
  assert.equal(result.evidence.reliabilityScore, 50);
  assert.ok(result.reasons.includes('EVIDENCE_UNCERTAIN'));
});

test('submitted paid evidence remains uncertain until settlement', () => {
  const result = evaluateCandidate(input({
    candidate: candidate({
      transactionEvidence: [{
        source: 'paid_x402', completed: 100, disputed: 0, failed: 0, verified: true,
        paymentStatus: 'SUBMITTED', evidenceId: 'submitted-payment',
      }],
    }),
  }));
  assert.equal(result.evidence.reliableTransactionCount, 0);
  assert.equal(result.evidence.uncertainTransactionCount, 1);
  assert.ok(result.reasons.includes('EVIDENCE_UNCERTAIN'));
});

test('minimum reliability is an explicit eligibility gate separate from score', () => {
  const result = evaluateCandidate(input({ minimumReliability: 95 }));
  assert.equal(result.score, 0);
  assert.equal(result.decision, 'ambiguous');
  assert.equal(result.eligible, false);
  assert.equal(result.reliabilityThreshold, 95);
  assert.ok(result.reasons.includes('RELIABILITY_BELOW_THRESHOLD'));
  assert.ok(result.breakdown.reliability < 95);
});

test('strong match labels require an explicit threshold and settled evidence', () => {
  const result = evaluateCandidate(input({ minimumReliability: 80 }));
  assert.equal(result.matchLabel, 'STRONG_MATCH');
  assert.equal(classifyMatchLabel(result.evidence, true, undefined), 'POSSIBLE_MATCH');
});

test('reliability thresholds reject malformed policy input before evaluation', () => {
  assert.throws(
    () => evaluateCandidate(input({ minimumReliability: 101 })),
    /INVALID_MINIMUM_RELIABILITY/,
  );
});

test('suppression is version-scoped and never becomes a permanent global seller ban', () => {
  const blocked = evaluateCandidate(input({
    suppression: {
      candidateId: 'candidate-1',
      mandateVersion: 3,
      candidateVersion: 1,
      state: 'never_retry_current_versions',
      reason: 'RETRY_ON_MATERIAL_CHANGE',
    },
  }));
  assert.equal(blocked.decision, 'rejected');
  assert.ok(blocked.reasons.includes('SUPPRESSED_CURRENT_VERSION'));

  const newVersion = evaluateCandidate(input({
    candidate: candidate({ version: 2 }),
    suppression: {
      candidateId: 'candidate-1',
      mandateVersion: 3,
      candidateVersion: 1,
      state: 'never_retry_current_versions',
      reason: 'RETRY_ON_MATERIAL_CHANGE',
    },
  }));
  assert.equal(newVersion.eligible, true);
  assert.equal(newVersion.reasons.includes('SUPPRESSED_CURRENT_VERSION'), false);
});

test('ranking is deterministic, excludes rejected candidates, and uses candidate id as final tie break', () => {
  const tieMandate = { ...mandate, relationshipDealsBySeller: {} };
  const inputs = [
    input({ mandate: tieMandate, candidate: candidate({ candidateId: 'candidate-z', version: 1 }) }),
    input({ mandate: tieMandate, candidate: candidate({ candidateId: 'candidate-a', version: 1, sellerAgentAddress: '0xseller-a', sellerOwnerAddress: '0xowner-a' }) }),
    input({ mandate: tieMandate, candidate: candidate({ candidateId: 'candidate-rejected', priceUsdc: '200.00' }) }),
  ];
  const ranked = rankCandidates(inputs);
  assert.equal(ranked.length, 2);
  assert.deepEqual(ranked.map((entry) => entry.candidate.candidateId), ['candidate-a', 'candidate-z']);
  assert.equal(ranked.every((entry) => entry.evaluation.eligible), true);
});

test('duplicate candidate snapshots are evaluated once while newer versions remain distinct', () => {
  const first = input({ candidate: candidate({ candidateId: 'candidate-duplicate', version: 1 }) });
  const duplicate = structuredClone(first);
  const newer = input({ candidate: candidate({ candidateId: 'candidate-duplicate', version: 2 }) });

  assert.equal(dedupeCandidateInputs([first, duplicate, newer]).length, 2);
  assert.equal(evaluateCandidates([first, duplicate, newer]).length, 2);
  assert.equal(rankCandidates([first, duplicate, newer]).length, 2);
});
