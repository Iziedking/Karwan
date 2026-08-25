import type { BuyerTimerParitySummary } from '../agents/buyerTaskParity.js';
import type { DurableTaskAuditSummary } from '../agents/durableTaskRunner.js';
import type { NegotiationShadowSummary } from '../agents/negotiationTaskShadow.js';
import type { EvidenceRuntimeAuditSummary } from '../evidence/runtime.js';
import type { FinancialRuntimeAuditSummary } from '../financial/runtime.js';
import type { MatchingAuditSummary } from '../matching/audit.js';
import type { MatchingReviewCoverage } from '../matching/reviewCoverage.js';
import type { NegotiationCommandAuditSummary } from '../negotiation/commandLedger.js';
import {
  evaluateShadowRollout,
  type RolloutGateResult,
  type RolloutThresholds,
  type ShadowRolloutMetrics,
} from './gates.js';

export interface RolloutAuditSources {
  matching?: MatchingAuditSummary | null;
  matchingReviewCoverage?: MatchingReviewCoverage | null;
  parity?: BuyerTimerParitySummary | null;
  negotiation?: NegotiationShadowSummary | null;
  negotiationCommands?: NegotiationCommandAuditSummary | null;
  evidence?: EvidenceRuntimeAuditSummary | null;
  financial?: FinancialRuntimeAuditSummary | null;
  tasks?: DurableTaskAuditSummary | null;
}

export interface ShadowRolloutReport {
  metrics: ShadowRolloutMetrics;
  /** Optional matching latency and paid-call measurements; null means no source measured them. */
  matchingTelemetry?: MatchingAuditSummary['telemetry'] | null;
  matchingReviewCoverage?: MatchingReviewCoverage | null;
  thresholds: RolloutThresholds;
  missingMetrics: readonly string[];
  metricsComplete: boolean;
  gate: RolloutGateResult;
}

/**
 * Builds the operator-facing cutover report from read-only audit summaries.
 * Missing counters are explicit blockers. The report never treats an absent
 * telemetry source as a clean zero, because that could authorize a rollout
 * without evidence.
 */
export function buildShadowRolloutReport(
  sources: RolloutAuditSources,
  thresholds: RolloutThresholds,
): ShadowRolloutReport {
  const missingMetrics: string[] = [];
  const matching = sources.matching;
  const matchingReviewCoverage = sources.matchingReviewCoverage;
  const parity = sources.parity;
  const negotiation = sources.negotiation;
  const negotiationCommands = sources.negotiationCommands;
  const evidence = sources.evidence;
  const financial = sources.financial;
  const tasks = sources.tasks;

  if (!matching) missingMetrics.push('matching.observations');
  // Review coverage is a release prerequisite, not an optional convenience.
  // Treat both omitted and explicit null sources as incomplete so a caller
  // cannot obtain an eligible gate by forgetting to wire the review ledger.
  if (!matchingReviewCoverage) missingMetrics.push('matching.reviews');
  if (matchingReviewCoverage && !matchingReviewCoverage.scanComplete) {
    missingMetrics.push('matching.reviews.window');
  }
  if (!parity) missingMetrics.push('buyerTimer.observations');
  if (!negotiation) missingMetrics.push('negotiation.observations');
  if (!negotiationCommands) {
    missingMetrics.push('negotiation.staleOfferAcceptances', 'negotiation.duplicateCommandConflicts');
  }
  if (matching && matching.uncertainEvidenceUses === undefined) {
    missingMetrics.push('matching.uncertainEvidenceUses');
  }
  if (!evidence) missingMetrics.push('evidence.unknownEvidenceUsed');
  if (!financial) missingMetrics.push('financial.uncertainProviderStates');
  if (!tasks) missingMetrics.push('tasks.deadLetters');

  const metrics: ShadowRolloutMetrics = {
    observations: (matching?.total ?? 0) + (parity?.total ?? 0) + (negotiation?.total ?? 0),
    matchingDivergences: matching?.comparison.diverged ?? 0,
    timerDivergences: parity
      ? parity.comparison.diverged + parity.task.diverged
      : 0,
    deadLetters: tasks?.deadLettered ?? 0,
    leaseLosses: tasks?.leaseLosses ?? 0,
    duplicateCommandConflicts: negotiationCommands?.duplicateCommandConflicts ?? 0,
    staleOfferAcceptances: negotiationCommands?.staleOfferAcceptances ?? 0,
    repeatedReengagements: tasks?.repeatedReengagements ?? 0,
    semanticReviewsPending: matching?.semanticReviewCandidates ?? 0,
    matchingFalseNegativeReviews: matching?.falseNegativeReviews ?? 0,
    matchingReviewsPending: matchingReviewCoverage?.pendingCount ?? 0,
    matchingReviewsNeedingEvidence: matchingReviewCoverage?.needsMoreEvidenceCount ?? 0,
    // Conservative: an unresolved purchase is treated as potentially used
    // until a decision-level usage counter exists.
    unknownEvidenceUsed: (evidence?.unknownPurchases ?? 0)
      + (matching?.uncertainEvidenceUses ?? 0),
    evidenceSettlementConflicts: evidence?.settlementConflicts ?? 0,
    uncertainFinancialStates: financial ? financial.unknown + financial.reconciling : 0,
  };
  const evaluated = evaluateShadowRollout(metrics, thresholds);
  const gate: RolloutGateResult = missingMetrics.length > 0
    ? {
        eligible: false,
        reasons: [...evaluated.reasons, 'METRICS_INCOMPLETE'],
        killSwitch: true,
      }
    : evaluated;

  return {
    metrics,
    ...(matching?.telemetry === undefined
      ? { matchingTelemetry: null }
      : { matchingTelemetry: matching.telemetry }),
    ...(matchingReviewCoverage !== undefined ? { matchingReviewCoverage } : {}),
    thresholds,
    missingMetrics,
    metricsComplete: missingMetrics.length === 0,
    gate,
  };
}
