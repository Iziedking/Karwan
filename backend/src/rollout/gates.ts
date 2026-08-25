export interface ShadowRolloutMetrics {
  observations: number;
  matchingDivergences: number;
  timerDivergences: number;
  deadLetters: number;
  leaseLosses: number;
  duplicateCommandConflicts: number;
  staleOfferAcceptances: number;
  repeatedReengagements: number;
  /** Semantic candidates awaiting a validated review result. */
  semanticReviewsPending?: number;
  /** Legacy winners absent from the shadow candidate set need review. */
  matchingFalseNegativeReviews?: number;
  /** Disagreement queue items without an immutable human disposition. */
  matchingReviewsPending?: number;
  /** Reviewed disagreements explicitly blocked pending more evidence. */
  matchingReviewsNeedingEvidence?: number;
  /** Evidence with UNKNOWN/RECONCILING settlement must never qualify cutover. */
  unknownEvidenceUsed?: number;
  evidenceSettlementConflicts?: number;
  /** Financial commands with UNKNOWN/RECONCILING provider state must block cutover. */
  uncertainFinancialStates?: number;
}

export interface RolloutThresholds {
  minimumObservations: number;
  maximumStaleOfferAcceptances: number;
  maximumUnknownEvidenceUsed?: number;
  maximumEvidenceSettlementConflicts?: number;
  maximumUncertainFinancialStates?: number;
}

export interface RolloutGateResult {
  eligible: boolean;
  reasons: readonly string[];
  killSwitch: boolean;
}

export function evaluateShadowRollout(metrics: ShadowRolloutMetrics, thresholds: RolloutThresholds): RolloutGateResult {
  const reasons: string[] = [];
  if (metrics.observations < thresholds.minimumObservations) reasons.push('INSUFFICIENT_OBSERVATIONS');
  if (metrics.matchingDivergences > 0) reasons.push('MATCHING_DIVERGENCE');
  if (metrics.timerDivergences > 0) reasons.push('TIMER_DIVERGENCE');
  if (metrics.deadLetters > 0) reasons.push('DEAD_LETTERS_PRESENT');
  if (metrics.leaseLosses > 0) reasons.push('LEASE_LOSS_PRESENT');
  if (metrics.duplicateCommandConflicts > 0) reasons.push('COMMAND_IDEMPOTENCY_CONFLICT');
  if (metrics.staleOfferAcceptances > thresholds.maximumStaleOfferAcceptances) reasons.push('STALE_ACCEPTANCE_RATE_TOO_HIGH');
  if (metrics.repeatedReengagements > 0) reasons.push('REPEATED_REENGAGEMENT');
  if ((metrics.semanticReviewsPending ?? 0) > 0) reasons.push('SEMANTIC_REVIEW_PENDING');
  if ((metrics.matchingFalseNegativeReviews ?? 0) > 0) reasons.push('MATCHING_FALSE_NEGATIVE_REVIEW');
  if ((metrics.matchingReviewsPending ?? 0) > 0) reasons.push('MATCHING_REVIEW_PENDING');
  if ((metrics.matchingReviewsNeedingEvidence ?? 0) > 0) reasons.push('MATCHING_REVIEW_NEEDS_EVIDENCE');
  if ((metrics.unknownEvidenceUsed ?? 0) > (thresholds.maximumUnknownEvidenceUsed ?? 0)) reasons.push('UNCERTAIN_EVIDENCE_USED');
  if ((metrics.evidenceSettlementConflicts ?? 0) > (thresholds.maximumEvidenceSettlementConflicts ?? 0)) reasons.push('EVIDENCE_SETTLEMENT_CONFLICT');
  if ((metrics.uncertainFinancialStates ?? 0) > (thresholds.maximumUncertainFinancialStates ?? 0)) reasons.push('UNCERTAIN_FINANCIAL_STATE');
  return { eligible: reasons.length === 0, reasons, killSwitch: reasons.length > 0 };
}
