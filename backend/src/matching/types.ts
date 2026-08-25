export const MATCHING_ENGINE_VERSION = 'matching-v2.0.0';
export const MATCHING_SCORING_VERSION = 'matching-score-v2.0.0';

export type MatchingLane = 'service' | 'finance';
export type MatchingCandidateKind = 'profile' | 'listing';
export type MatchingDecision = 'eligible' | 'ambiguous' | 'near_miss' | 'rejected';
export type MatchingMatchLabel = 'STRONG_MATCH' | 'POSSIBLE_MATCH' | 'EVIDENCE_PENDING';
export type MatchingEvidenceStatus = 'declared' | 'verified' | 'expired' | 'revoked' | 'rejected';
export type MatchingPaymentStatus =
  | 'AUTHORIZED'
  | 'SUBMITTED'
  | 'SETTLED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'FAILED';

export type MatchingReasonCode =
  | 'SELF_DEALING'
  | 'LANE_MISMATCH'
  | 'ACCOUNT_INELIGIBLE'
  | 'EXPIRED_CANDIDATE'
  | 'EXPIRED_REQUEST'
  | 'PROHIBITED_CATEGORY'
  | 'CAPACITY_EXCEEDED'
  | 'DEADLINE_TOO_LATE'
  | 'PRICE_OVER_CAP'
  | 'NO_SKILL_COVERAGE'
  | 'SKILL_UNVERIFIED'
  | 'SKILL_VERIFIED'
  | 'EVIDENCE_UNCERTAIN'
  | 'RELIABILITY_BELOW_THRESHOLD'
  | 'SUPPRESSED_CURRENT_VERSION'
  | 'RETRY_AFTER_COOLDOWN'
  | 'RETRY_ON_MATERIAL_CHANGE'
  | 'SEMANTIC_EVALUATION_REQUIRED'
  | 'SEMANTIC_EVALUATION_REJECTED'
  | 'SEMANTIC_CONFIDENCE_TOO_LOW'
  | 'MATCH_ELIGIBLE'
  | 'NEAR_MISS_WITHIN_STRETCH';

export interface MatchingSkillEvidence {
  skillId: string;
  status: MatchingEvidenceStatus;
  issuer?: string;
  evidenceId?: string;
  expiresAtUnix?: number;
}

export interface MatchingTransactionEvidence {
  source: 'karwan_onchain' | 'karwan_settled' | 'paid_x402' | 'self_asserted';
  completed: number;
  disputed: number;
  failed: number;
  fetchedAtUnix?: number;
  expiresAtUnix?: number;
  paymentStatus?: MatchingPaymentStatus;
  verified: boolean;
  evidenceId?: string;
}

export interface MatchingMandateSnapshot {
  mandateId: string;
  version: number;
  ownerAddress: string;
  agentAddress?: string;
  lane: MatchingLane;
  budgetUsdc: string;
  maxBudgetUsdc?: string;
  maxDeadlineUnix: number;
  minDeadlineUnix?: number;
  requiredKeywords: string[];
  /** Immutable risk-policy threshold for a strong match in this mandate. */
  minimumReliability?: number;
  reliabilityPolicyVersion?: string;
  prohibitedCategories?: string[];
  requiresVerifiedBusiness?: boolean;
  accountEligible?: boolean;
  relationshipDealsBySeller?: Record<string, number>;
}

export interface MatchingCandidateSnapshot {
  candidateId: string;
  version: number;
  kind: MatchingCandidateKind;
  sellerAgentAddress: string;
  sellerOwnerAddress?: string;
  lane: MatchingLane;
  partyKind?: 'person' | 'business';
  title?: string;
  description?: string;
  keywords: string[];
  declaredSkills?: string[];
  skillEvidence?: MatchingSkillEvidence[];
  transactionEvidence?: MatchingTransactionEvidence[];
  tier?: 'new' | 'cold' | 'established' | 'strong' | 'elite';
  reputationBps?: number;
  priceUsdc: string;
  deadlineUnix: number;
  capacityAvailable?: boolean;
  prohibitedCategories?: string[];
  expiresAtUnix?: number;
}

export interface MatchingSuppression {
  candidateId: string;
  mandateVersion: number;
  candidateVersion: number;
  state: 'never_retry_current_versions' | 'retry_when_condition_changes';
  reason: MatchingReasonCode;
  retryAtUnix?: number;
  materialTrigger?: string;
}

export interface MatchingEvaluationInput {
  mandate: MatchingMandateSnapshot;
  candidate: MatchingCandidateSnapshot;
  nowUnix: number;
  suppression?: MatchingSuppression;
  nearMissStretchPct?: number;
  /** Optional per-call override used by isolated policy tests. */
  minimumReliability?: number;
}

export interface MatchingFilterResult {
  passed: boolean;
  reasons: MatchingReasonCode[];
  nearMiss: boolean;
}

export interface MatchingEvidenceSummary {
  declaredSkillIds: string[];
  verifiedSkillIds: string[];
  expiredSkillIds: string[];
  revokedSkillIds: string[];
  reliabilityScore: number;
  reliableTransactionCount: number;
  uncertainTransactionCount: number;
  evidenceIds: string[];
}

export interface MatchingScoreBreakdown {
  skillCoverage: number;
  priceValue: number;
  reliability: number;
  reputation: number;
  deadlineCapacity: number;
  relationship: number;
}

export interface MatchingEvaluation {
  engineVersion: typeof MATCHING_ENGINE_VERSION;
  scoringVersion: typeof MATCHING_SCORING_VERSION;
  candidateId: string;
  candidateVersion: number;
  mandateVersion: number;
  decision: MatchingDecision;
  /** A user-safe reliability label, never inferred from score alone. */
  matchLabel: MatchingMatchLabel;
  eligible: boolean;
  score: number;
  skillCoverage: number;
  reasons: MatchingReasonCode[];
  filters: MatchingFilterResult;
  evidence: MatchingEvidenceSummary;
  breakdown: MatchingScoreBreakdown;
  deterministicSeed: string;
  /** The caller-supplied evidence threshold used for this evaluation. */
  reliabilityThreshold?: number;
  semantic?: {
    decision: 'accepted' | 'rejected';
    confidence: number;
    capabilityIds: string[];
    requirementCoverage: Array<{
      requirementId: string;
      coverage: 'NONE' | 'WEAK' | 'STRONG';
      evidenceIds: string[];
    }>;
    risks: string[];
    reasonCodes: string[];
    reason: string;
  };
}

export interface MatchingRankedCandidate {
  candidate: MatchingCandidateSnapshot;
  evaluation: MatchingEvaluation;
}
