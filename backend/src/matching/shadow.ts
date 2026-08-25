import {
  dedupeCandidateInputs,
  evaluateCandidate,
  rankCandidates,
} from './engine.js';
import { planSemanticEvaluations } from './semanticEvaluator.js';
import type {
  MatchingAuditObservation,
  MatchingAuditStore,
  MatchingAuditSource,
  MatchingAuditTelemetry,
} from './audit.js';
import type { MatchingEvaluationInput, MatchingMandateSnapshot, MatchingCandidateSnapshot } from './types.js';

export interface MatchingShadowObservation {
  source: MatchingAuditSource;
  observationKey: string;
  mandate: MatchingMandateSnapshot;
  candidates: MatchingCandidateSnapshot[];
  legacyCandidateIds: string[];
  nowUnix: number;
  nearMissStretchPct?: number;
  telemetry?: MatchingAuditTelemetry;
}

export type MatchingShadowObserver = (observation: MatchingShadowObservation) => Promise<void>;

export function createMatchingShadowObserver(store: MatchingAuditStore): MatchingShadowObserver {
  return async (input) => {
    const startedAt = performance.now();
    const evaluationInputs = dedupeCandidateInputs(input.candidates.map((candidate) => {
      const evaluationInput: MatchingEvaluationInput = {
        mandate: input.mandate,
        candidate,
        nowUnix: input.nowUnix,
        ...(input.nearMissStretchPct === undefined ? {} : { nearMissStretchPct: input.nearMissStretchPct }),
      };
      return evaluationInput;
    }));
    const evaluations = evaluationInputs.map(evaluateCandidate);
    const ranked = rankCandidates(evaluationInputs);
    const semanticReviewCandidates = planSemanticEvaluations(evaluationInputs).map((plan) => ({
      candidateId: plan.candidateId,
      candidateVersion: plan.candidateVersion,
    }));
    const measuredShadowLatencyMs = Math.max(0, performance.now() - startedAt);
    const audit: MatchingAuditObservation = {
      observationKey: input.observationKey,
      source: input.source,
      mandateId: input.mandate.mandateId,
      mandateVersion: input.mandate.version,
      legacyCandidateIds: [...input.legacyCandidateIds],
      shadowCandidateIds: ranked.map((entry) => entry.candidate.candidateId),
      evaluations,
      ...(semanticReviewCandidates.length > 0 ? { semanticReviewCandidates } : {}),
      telemetry: {
        ...input.telemetry,
        // The observer is pure and has no paid-call capability. Keep that
        // accounting explicit when a caller supplies the legacy measurement.
        shadowLatencyMs: input.telemetry?.shadowLatencyMs ?? measuredShadowLatencyMs,
      },
      observedAt: input.nowUnix,
    };
    await store.record(audit);
  };
}
