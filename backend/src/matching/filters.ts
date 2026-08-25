import { parseUsdcMicro } from './money.js';
import { containsProhibitedCategory, skillCoverage } from './taxonomy.js';
import type { MatchingEvaluationInput, MatchingFilterResult } from './types.js';

export function applyHardFilters(input: MatchingEvaluationInput): MatchingFilterResult {
  const { mandate, candidate, nowUnix } = input;
  const reasons: MatchingFilterResult['reasons'] = [];
  const candidateTerms = [candidate.title ?? '', candidate.description ?? '', ...candidate.keywords, ...(candidate.declaredSkills ?? [])];

  if (mandate.ownerAddress.toLowerCase() === (candidate.sellerOwnerAddress ?? candidate.sellerAgentAddress).toLowerCase()
    || mandate.agentAddress?.toLowerCase() === candidate.sellerAgentAddress.toLowerCase()) {
    reasons.push('SELF_DEALING');
  }
  if (mandate.lane !== candidate.lane) reasons.push('LANE_MISMATCH');
  if (mandate.accountEligible === false) reasons.push('ACCOUNT_INELIGIBLE');
  if (candidate.expiresAtUnix !== undefined && candidate.expiresAtUnix <= nowUnix) reasons.push('EXPIRED_CANDIDATE');
  if (mandate.maxDeadlineUnix <= nowUnix) reasons.push('EXPIRED_REQUEST');
  if (candidate.deadlineUnix > mandate.maxDeadlineUnix) reasons.push('DEADLINE_TOO_LATE');
  if (candidate.capacityAvailable === false) reasons.push('CAPACITY_EXCEEDED');
  if (containsProhibitedCategory(mandate.prohibitedCategories, candidateTerms)
    || containsProhibitedCategory(candidate.prohibitedCategories, mandate.requiredKeywords)) {
    reasons.push('PROHIBITED_CATEGORY');
  }
  if (mandate.requiresVerifiedBusiness && candidate.partyKind !== 'business') {
    reasons.push('ACCOUNT_INELIGIBLE');
  }

  const budget = parseUsdcMicro(mandate.maxBudgetUsdc ?? mandate.budgetUsdc);
  const price = parseUsdcMicro(candidate.priceUsdc);
  if (price > budget) reasons.push('PRICE_OVER_CAP');

  const coverage = skillCoverage(mandate.requiredKeywords, candidate.keywords);
  if (coverage === 0) reasons.push('NO_SKILL_COVERAGE');

  const nearMissStretchPct = Math.max(0, input.nearMissStretchPct ?? 40);
  const stretchCap = budget + (budget * BigInt(Math.round(nearMissStretchPct * 100))) / 10_000n;
  const nearMiss = price > budget && price <= stretchCap && reasons.every((reason) => reason === 'PRICE_OVER_CAP');
  // A zero lexical overlap is an ambiguous survivor for the semantic
  // evaluator, not a hard rejection. Every other filter remains fail-closed.
  const hardReasons = reasons.filter((reason) => reason !== 'NO_SKILL_COVERAGE');
  return { passed: hardReasons.length === 0, reasons, nearMiss };
}
