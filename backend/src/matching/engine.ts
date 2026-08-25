import { createHash } from 'node:crypto';
import { applyHardFilters } from './filters.js';
import { scoreCandidate } from './scoring.js';
import { verifiedSkillEvidence } from './evidence.js';
import type {
  MatchingEvaluation,
  MatchingEvaluationInput,
  MatchingEvidenceSummary,
  MatchingMatchLabel,
  MatchingRankedCandidate,
} from './types.js';
import { MATCHING_ENGINE_VERSION, MATCHING_SCORING_VERSION } from './types.js';

function deterministicSeed(input: MatchingEvaluationInput): string {
  return createHash('sha256')
    .update(JSON.stringify({
      mandateId: input.mandate.mandateId,
      mandateVersion: input.mandate.version,
      minimumReliability: input.minimumReliability ?? input.mandate.minimumReliability ?? null,
      reliabilityPolicyVersion: input.mandate.reliabilityPolicyVersion ?? null,
      candidateId: input.candidate.candidateId,
      candidateVersion: input.candidate.version,
    }))
    .digest('hex');
}

export function evaluateCandidate(input: MatchingEvaluationInput): MatchingEvaluation {
  const reliabilityThreshold = validateReliabilityThreshold(
    input.minimumReliability ?? input.mandate.minimumReliability,
  );
  const filters = applyHardFilters(input);
  const scored = scoreCandidate(input);
  const verified = verifiedSkillEvidence(input.candidate.skillEvidence, input.nowUnix);
  const reasons = [...filters.reasons];

  if (input.suppression
    && input.suppression.mandateVersion === input.mandate.version
    && input.suppression.candidateVersion === input.candidate.version) {
    if (input.suppression.state === 'never_retry_current_versions') {
      reasons.push('SUPPRESSED_CURRENT_VERSION');
    } else if (input.suppression.retryAtUnix !== undefined && input.suppression.retryAtUnix > input.nowUnix) {
      reasons.push('RETRY_AFTER_COOLDOWN');
    } else {
      reasons.push('RETRY_ON_MATERIAL_CHANGE');
    }
  }

  if (verified.length > 0) reasons.push('SKILL_VERIFIED');
  else if (scored.skillCoverage > 0) reasons.push('SKILL_UNVERIFIED');
  if (scored.evidence.uncertainTransactionCount > 0) reasons.push('EVIDENCE_UNCERTAIN');
  const reliabilityBelowThreshold = reliabilityThreshold !== undefined
    && scored.evidence.reliabilityScore < reliabilityThreshold;
  if (reliabilityBelowThreshold) reasons.push('RELIABILITY_BELOW_THRESHOLD');

  let decision: MatchingEvaluation['decision'] = 'eligible';
  let eligible = filters.passed && !reasons.includes('SUPPRESSED_CURRENT_VERSION') && !reasons.includes('RETRY_AFTER_COOLDOWN');
  if (filters.nearMiss) {
    decision = 'near_miss';
    eligible = false;
    reasons.push('NEAR_MISS_WITHIN_STRETCH');
  } else if (!filters.passed || reasons.includes('SUPPRESSED_CURRENT_VERSION') || reasons.includes('RETRY_AFTER_COOLDOWN')) {
    decision = 'rejected';
  } else if (reliabilityBelowThreshold) {
    // A candidate may still be a useful possible match, but it cannot be
    // eligible for a risk class whose evidence threshold it failed.
    decision = 'ambiguous';
    eligible = false;
  } else if (input.mandate.requiredKeywords.length > 0 && scored.skillCoverage === 0) {
    decision = 'ambiguous';
    eligible = false;
    reasons.push('SEMANTIC_EVALUATION_REQUIRED');
  }

  if (eligible) reasons.push('MATCH_ELIGIBLE');
  const matchLabel = classifyMatchLabel(scored.evidence, eligible, reliabilityThreshold);
  return {
    engineVersion: MATCHING_ENGINE_VERSION,
    scoringVersion: MATCHING_SCORING_VERSION,
    candidateId: input.candidate.candidateId,
    candidateVersion: input.candidate.version,
    mandateVersion: input.mandate.version,
    decision,
    eligible,
    matchLabel,
    score: eligible ? scored.score : 0,
    skillCoverage: scored.skillCoverage,
    reasons: [...new Set(reasons)],
    filters,
    evidence: scored.evidence,
    breakdown: scored.breakdown,
    deterministicSeed: deterministicSeed(input),
    ...(reliabilityThreshold === undefined ? {} : { reliabilityThreshold }),
  };
}

/**
 * A strong label requires an explicit threshold plus settled, referenced
 * evidence. Score and reputation alone can only produce POSSIBLE_MATCH.
 */
export function classifyMatchLabel(
  evidence: MatchingEvidenceSummary,
  eligible: boolean,
  reliabilityThreshold?: number,
): MatchingMatchLabel {
  if (evidence.uncertainTransactionCount > 0) return 'EVIDENCE_PENDING';
  if (
    !eligible
    || reliabilityThreshold === undefined
    || evidence.reliableTransactionCount === 0
    || evidence.reliabilityScore < reliabilityThreshold
  ) {
    return 'POSSIBLE_MATCH';
  }
  return 'STRONG_MATCH';
}

function validateReliabilityThreshold(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error('INVALID_MINIMUM_RELIABILITY');
  }
  return value;
}

/**
 * Matching observations can contain the same candidate more than once when
 * profile- and listing-driven discovery overlap. Candidate identity is
 * versioned, so an exact candidate/version pair is evaluated once while a
 * newer version remains a distinct snapshot. The first occurrence wins to
 * preserve the caller's deterministic order and the input is never mutated.
 */
export function dedupeCandidateInputs(
  inputs: readonly MatchingEvaluationInput[],
): MatchingEvaluationInput[] {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const key = `${input.candidate.candidateId}|${input.candidate.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function evaluateCandidates(
  inputs: readonly MatchingEvaluationInput[],
): MatchingEvaluation[] {
  return dedupeCandidateInputs(inputs).map(evaluateCandidate);
}

function rankEvaluatedCandidates(
  inputs: readonly MatchingEvaluationInput[],
  evaluations: readonly MatchingEvaluation[],
): MatchingRankedCandidate[] {
  return inputs
    .map((input, index) => ({ candidate: input.candidate, evaluation: evaluations[index]! }))
    .filter((entry) => entry.evaluation.eligible)
    .sort((a, b) => {
      if (b.evaluation.score !== a.evaluation.score) return b.evaluation.score - a.evaluation.score;
      if (b.evaluation.skillCoverage !== a.evaluation.skillCoverage) return b.evaluation.skillCoverage - a.evaluation.skillCoverage;
      return a.candidate.candidateId.localeCompare(b.candidate.candidateId);
    });
}

export function rankCandidates(
  inputs: readonly MatchingEvaluationInput[],
): MatchingRankedCandidate[] {
  const uniqueInputs = dedupeCandidateInputs(inputs);
  return rankEvaluatedCandidates(uniqueInputs, uniqueInputs.map(evaluateCandidate));
}
