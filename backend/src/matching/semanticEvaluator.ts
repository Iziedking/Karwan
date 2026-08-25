import { z } from 'zod';
import { classifyMatchLabel, dedupeCandidateInputs, evaluateCandidate } from './engine.js';
import { normalizeTerms } from './taxonomy.js';
import type {
  MatchingEvaluation,
  MatchingEvaluationInput,
  MatchingReasonCode,
} from './types.js';

const requirementCoverageSchema = z.object({
  requirementId: z.string().min(1),
  coverage: z.enum(['NONE', 'WEAK', 'STRONG']),
  evidenceIds: z.array(z.string().min(1)).max(100),
}).strict();

const semanticResponseSchema = z.object({
  candidateId: z.string().min(1),
  candidateVersion: z.number().int().positive(),
  mandateVersion: z.number().int().positive(),
  decision: z.enum(['MATCH', 'NO_MATCH']),
  confidence: z.number().min(0).max(1),
  capabilityIds: z.array(z.string().min(1)).max(100),
  requirementCoverage: z.array(requirementCoverageSchema).max(100),
  risks: z.array(z.string().min(1)).max(100),
  reasonCodes: z.array(z.string().min(1)).max(100),
  reason: z.string().min(1).max(500),
}).strict();

export type SemanticEvaluationResponse = z.infer<typeof semanticResponseSchema>;

interface SemanticRequirement {
  requirementId: string;
  label: string;
}

interface SemanticCapability {
  capabilityId: string;
  label: string;
  evidenceIds: string[];
}

export interface SemanticEvaluationRequest {
  candidateId: string;
  candidateVersion: number;
  mandateVersion: number;
  requirements: SemanticRequirement[];
  capabilities: SemanticCapability[];
  allowedCapabilityIds: string[];
  allowedEvidenceIds: string[];
  candidate: {
    title?: string;
    description?: string;
    keywords: string[];
    declaredSkills: string[];
  };
}

export interface SemanticEvaluationPlan {
  candidateId: string;
  candidateVersion: number;
  mandateVersion: number;
  request: SemanticEvaluationRequest;
}

export interface SemanticResolutionOptions {
  minimumConfidence?: number;
}

function semanticRequirements(input: MatchingEvaluationInput): SemanticRequirement[] {
  return normalizeTerms(input.mandate.requiredKeywords).map((term, index) => ({
    requirementId: `req-${index + 1}`,
    label: term,
  }));
}

function semanticCapabilities(input: MatchingEvaluationInput): SemanticCapability[] {
  const terms = normalizeTerms([
    ...input.candidate.keywords,
    ...(input.candidate.declaredSkills ?? []),
  ]);
  const skillEvidence = input.candidate.skillEvidence ?? [];

  return terms.map((term) => {
    const evidenceIds = [`declared:${term}`];
    for (const evidence of skillEvidence) {
      if (normalizeTerms([evidence.skillId]).includes(term) && evidence.evidenceId) {
        evidenceIds.push(evidence.evidenceId);
      }
    }
    return {
      capabilityId: `cap:${term}`,
      label: term,
      evidenceIds: [...new Set(evidenceIds)].sort(),
    };
  });
}

function semanticRequestParts(input: MatchingEvaluationInput) {
  const requirements = semanticRequirements(input);
  const capabilities = semanticCapabilities(input);
  return {
    requirements,
    capabilities,
    allowedCapabilityIds: capabilities.map((capability) => capability.capabilityId),
    allowedEvidenceIds: [...new Set(capabilities.flatMap((capability) => capability.evidenceIds))].sort(),
  };
}

/**
 * Build a model-facing semantic request only for deterministic ambiguous
 * survivors. Hard-filter failures never reach this boundary, and the request
 * carries no addresses, wallet data, or policy controls for a model to edit.
 */
export function buildSemanticEvaluationRequest(
  input: MatchingEvaluationInput,
): SemanticEvaluationRequest | null {
  const base = evaluateCandidate(input);
  if (base.decision !== 'ambiguous' || base.reasons.includes('RELIABILITY_BELOW_THRESHOLD')) return null;
  const parts = semanticRequestParts(input);
  return {
    candidateId: input.candidate.candidateId,
    candidateVersion: input.candidate.version,
    mandateVersion: input.mandate.version,
    ...parts,
    candidate: {
      ...(input.candidate.title ? { title: input.candidate.title } : {}),
      ...(input.candidate.description ? { description: input.candidate.description } : {}),
      keywords: [...input.candidate.keywords],
      declaredSkills: [...(input.candidate.declaredSkills ?? [])],
    },
  };
}

/**
 * Plan semantic work for a shadow observation without invoking a model.
 * Hard-filter failures and duplicate candidate snapshots never enter the
 * plan. The returned metadata is safe to persist as an audit pointer; the
 * request remains an explicit, immutable boundary for a later provider.
 */
export function planSemanticEvaluations(
  inputs: readonly MatchingEvaluationInput[],
): SemanticEvaluationPlan[] {
  return dedupeCandidateInputs(inputs).flatMap((input) => {
    if (evaluateCandidate(input).decision !== 'ambiguous') return [];
    const request = buildSemanticEvaluationRequest(input);
    if (!request) return [];
    return [{
      candidateId: input.candidate.candidateId,
      candidateVersion: input.candidate.version,
      mandateVersion: input.mandate.version,
      request,
    }];
  });
}

export function parseSemanticEvaluationResponse(
  input: unknown,
): SemanticEvaluationResponse {
  return semanticResponseSchema.parse(input);
}

/**
 * Apply a validated semantic result to one deterministic ambiguous candidate.
 * Semantic output can resolve lexical ambiguity, but it cannot bypass hard
 * filters, alter mandate versions, invent capabilities/evidence, or raise the
 * deterministic score. Identity mismatches fail closed.
 */
export function resolveSemanticEvaluation(
  input: MatchingEvaluationInput,
  response: unknown,
  options: SemanticResolutionOptions = {},
): MatchingEvaluation {
  const base = evaluateCandidate(input);
  if (base.decision !== 'ambiguous') return base;

  const parsed = parseSemanticEvaluationResponse(response);
  if (
    parsed.candidateId !== input.candidate.candidateId
    || parsed.candidateVersion !== input.candidate.version
    || parsed.mandateVersion !== input.mandate.version
  ) {
    throw new Error('semantic evaluation identity mismatch');
  }

  const parts = semanticRequestParts(input);
  const allowedCapabilities = new Set(parts.allowedCapabilityIds);
  const allowedEvidence = new Set(parts.allowedEvidenceIds);
  const requirements = new Set(parts.requirements.map((requirement) => requirement.requirementId));
  const capabilityIds = [...new Set(parsed.capabilityIds)];
  if (capabilityIds.some((id) => !allowedCapabilities.has(id))) {
    throw new Error('semantic evaluation returned an invented capability');
  }
  const coverageIds = parsed.requirementCoverage.map((coverage) => coverage.requirementId);
  if (
    new Set(coverageIds).size !== coverageIds.length
    || coverageIds.length !== requirements.size
    || coverageIds.some((id) => !requirements.has(id))
  ) {
    throw new Error('semantic evaluation requirement coverage does not match the snapshot');
  }
  const requirementCoverage = parsed.requirementCoverage.map((coverage) => ({
    requirementId: coverage.requirementId,
    coverage: coverage.coverage,
    evidenceIds: [...new Set(coverage.evidenceIds)],
  }));
  if (requirementCoverage.some((coverage) => coverage.evidenceIds.some((id) => !allowedEvidence.has(id)))) {
    throw new Error('semantic evaluation returned invented evidence');
  }

  const minimumConfidence = Math.min(1, Math.max(0, options.minimumConfidence ?? 0.75));
  const strongCoverage = requirementCoverage.length > 0
    && requirementCoverage.every((coverage) => coverage.coverage === 'STRONG');
  const accepted = parsed.decision === 'MATCH'
    && parsed.confidence >= minimumConfidence
    && strongCoverage
    && capabilityIds.length > 0;
  const semantic = {
    decision: accepted ? 'accepted' as const : 'rejected' as const,
    confidence: parsed.confidence,
    capabilityIds,
    requirementCoverage,
    risks: [...new Set(parsed.risks)],
    reasonCodes: [...new Set(parsed.reasonCodes)],
    reason: parsed.reason,
  };

  if (accepted) {
    if (base.reasons.includes('RELIABILITY_BELOW_THRESHOLD')) {
      return {
        ...base,
        decision: 'ambiguous',
        eligible: false,
        score: 0,
        matchLabel: classifyMatchLabel(base.evidence, false, base.reliabilityThreshold),
        reasons: [...new Set<MatchingReasonCode>([
          ...base.reasons.filter((reason) => reason !== 'MATCH_ELIGIBLE'),
          'RELIABILITY_BELOW_THRESHOLD',
        ])],
        semantic: { ...semantic, decision: 'accepted' },
      };
    }
    return {
      ...base,
      decision: 'eligible',
      eligible: true,
      matchLabel: classifyMatchLabel(base.evidence, true, base.reliabilityThreshold),
      // Preserve deterministic score inputs; a model may resolve ambiguity,
      // but it cannot award itself a higher ranking score.
      reasons: [...new Set<MatchingReasonCode>([
        ...base.reasons.filter((reason) => reason !== 'SEMANTIC_EVALUATION_REQUIRED'),
        'MATCH_ELIGIBLE',
      ])],
      semantic,
    };
  }

  const reason: MatchingReasonCode = parsed.decision === 'NO_MATCH'
    ? 'SEMANTIC_EVALUATION_REJECTED'
    : 'SEMANTIC_CONFIDENCE_TOO_LOW';
  return {
    ...base,
    decision: parsed.decision === 'NO_MATCH' ? 'rejected' : 'ambiguous',
    eligible: false,
    score: 0,
    reasons: [...new Set<MatchingReasonCode>([
      ...base.reasons.filter((code) => code !== 'MATCH_ELIGIBLE'),
      reason,
    ])],
    semantic,
  };
}
