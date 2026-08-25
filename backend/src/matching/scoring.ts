import { parseUsdcMicro, boundedRatioScore } from './money.js';
import { skillCoverage } from './taxonomy.js';
import { summarizeEvidence } from './evidence.js';
import type {
  MatchingCandidateSnapshot,
  MatchingEvaluationInput,
  MatchingScoreBreakdown,
} from './types.js';

const TIER_SCORE: Record<NonNullable<MatchingCandidateSnapshot['tier']>, number> = {
  elite: 100,
  strong: 85,
  established: 65,
  cold: 40,
  new: 20,
};

function priceValue(input: MatchingEvaluationInput): number {
  const budget = parseUsdcMicro(input.mandate.maxBudgetUsdc ?? input.mandate.budgetUsdc);
  const price = parseUsdcMicro(input.candidate.priceUsdc);
  if (price <= budget) return 100;
  if (price === 0n) return 0;
  return boundedRatioScore(budget, price);
}

function deadlineCapacity(input: MatchingEvaluationInput): number {
  const remaining = Math.max(0, input.mandate.maxDeadlineUnix - input.nowUnix);
  const candidateWindow = Math.max(0, input.candidate.deadlineUnix - input.nowUnix);
  if (remaining === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((candidateWindow / remaining) * 100)));
}

export function scoreCandidate(input: MatchingEvaluationInput): {
  score: number;
  skillCoverage: number;
  breakdown: MatchingScoreBreakdown;
  evidence: ReturnType<typeof summarizeEvidence>;
} {
  const evidence = summarizeEvidence(input.candidate, input.nowUnix);
  const coverage = skillCoverage(input.mandate.requiredKeywords, input.candidate.keywords);
  const relationship = Math.min(100, Math.max(0, (input.mandate.relationshipDealsBySeller?.[input.candidate.sellerAgentAddress.toLowerCase()] ?? 0) * 35));
  const breakdown: MatchingScoreBreakdown = {
    skillCoverage: coverage,
    priceValue: priceValue(input),
    reliability: evidence.reliabilityScore,
    reputation: TIER_SCORE[input.candidate.tier ?? 'new'],
    deadlineCapacity: deadlineCapacity(input),
    relationship,
  };
  const score = Math.round(
    breakdown.skillCoverage * 0.35
      + breakdown.priceValue * 0.2
      + breakdown.reliability * 0.2
      + breakdown.reputation * 0.1
      + breakdown.deadlineCapacity * 0.1
      + breakdown.relationship * 0.05,
  );
  return { score, skillCoverage: coverage, breakdown, evidence };
}
