/// Imported reputation, model external-reputation-v1 (audit/AGENT_LANES_PLAN.md §5).
///
/// Scores the track record a person brings from elsewhere, so a newcomer with a
/// real history does not start from zero. Deterministic and versioned: the same
/// evidence always gives the same score, and anyone can recompute it from the
/// anchored inputs. An LLM may extract the outcomes; it never sets a weight or
/// the result.
///
/// Per source: outcomes are weighted by recency (half-life) and deal value
/// (log curve), each counterparty counts at most a few times, and the weighted
/// success rate is taken at its Wilson lower bound so a thin history cannot
/// outrank a long one. Sources are combined by verification strength, then
/// shrunk toward a neutral prior. Karwan-earned history is not scored here.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const EXTERNAL_REPUTATION_MODEL = 'external-reputation-v1';

/// How the evidence was obtained. Self-reported claims carry no weight.
export type VerificationLevel = 'partner' | 'official_api' | 'user_proof' | 'self_reported';

export interface ExternalOutcome {
  /// When the engagement ended, epoch ms.
  at: number;
  success: boolean;
  /// Deal value in USD, when the source reports it.
  valueUsd?: number;
  /// Stable id of the other party, when the source reports it.
  counterparty?: string;
}

export interface SourceEvidence {
  /// e.g. 'github', 'stackexchange', 'ebay'.
  source: string;
  verification: VerificationLevel;
  outcomes: readonly ExternalOutcome[];
}

export interface ExternalReputationParams {
  halfLifeDays: number;
  /// Deal value that weighs exactly 1. Smaller deals weigh less, larger more, concavely.
  referenceValueUsd: number;
  /// Most outcomes counted per counterparty (the most recent ones).
  perCounterpartyCap: number;
  /// Wilson z; 1.96 is the 95% lower bound.
  z: number;
  /// Pseudo-count and mean of the neutral prior.
  priorWeight: number;
  priorMean: number;
  verificationWeight: Record<VerificationLevel, number>;
  /// Largest share imported evidence may take in the Karwan composite.
  maxImportedWeight: number;
  /// Settled Karwan deals over which that share fades by a factor of e.
  importedFadeDeals: number;
}

export const EXTERNAL_REPUTATION_PARAMS: ExternalReputationParams = {
  halfLifeDays: 365,
  referenceValueUsd: 100,
  perCounterpartyCap: 3,
  z: 1.96,
  priorWeight: 20,
  priorMean: 0.5,
  verificationWeight: { partner: 1, official_api: 0.8, user_proof: 0.6, self_reported: 0 },
  maxImportedWeight: 0.15,
  importedFadeDeals: 10,
};

export interface SourceScore {
  source: string;
  verification: VerificationLevel;
  /// Weighted outcome count after decay, value weighting and the counterparty cap.
  effectiveTotal: number;
  effectiveSuccess: number;
  /// Wilson lower bound of the weighted success rate, [0,1].
  lowerBound: number;
}

export interface ExternalReputationResult {
  model: typeof EXTERNAL_REPUTATION_MODEL;
  /// [0,1], or null when no verifiable evidence exists. Absence of evidence is
  /// reported as such rather than as a neutral score.
  score: number | null;
  /// Verification-weighted evidence mass behind the score.
  evidence: number;
  sources: SourceScore[];
}

/// Wilson score interval lower bound. Accepts fractional (weighted) counts.
export function wilsonLowerBound(successes: number, total: number, z: number): number {
  if (total <= 0) return 0;
  const p = successes / total;
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return Math.min(1, Math.max(0, (centre - margin) / (1 + z2 / total)));
}

function outcomeWeight(o: ExternalOutcome, now: number, p: ExternalReputationParams): number {
  const ageDays = Math.max(0, (now - o.at) / MS_PER_DAY);
  const decay = Math.pow(2, -ageDays / p.halfLifeDays);
  const value =
    o.valueUsd !== undefined && o.valueUsd > 0 ? Math.log2(1 + o.valueUsd / p.referenceValueUsd) : 1;
  return decay * value;
}

/// Keep at most `cap` outcomes per counterparty, the most recent first, so one
/// friendly repeat client cannot manufacture a track record. Outcomes with no
/// counterparty id are kept as they are.
function capPerCounterparty(outcomes: readonly ExternalOutcome[], cap: number): ExternalOutcome[] {
  const sorted = [...outcomes].sort((a, b) => b.at - a.at);
  const seen = new Map<string, number>();
  return sorted.filter((o) => {
    if (!o.counterparty) return true;
    const n = seen.get(o.counterparty) ?? 0;
    seen.set(o.counterparty, n + 1);
    return n < cap;
  });
}

export function scoreSource(
  evidence: SourceEvidence,
  now: number,
  p: ExternalReputationParams = EXTERNAL_REPUTATION_PARAMS,
): SourceScore {
  let total = 0;
  let success = 0;
  for (const o of capPerCounterparty(evidence.outcomes, p.perCounterpartyCap)) {
    const w = outcomeWeight(o, now, p);
    total += w;
    if (o.success) success += w;
  }
  return {
    source: evidence.source,
    verification: evidence.verification,
    effectiveTotal: total,
    effectiveSuccess: success,
    lowerBound: wilsonLowerBound(success, total, p.z),
  };
}

export function externalReputation(
  sources: readonly SourceEvidence[],
  now: number = Date.now(),
  p: ExternalReputationParams = EXTERNAL_REPUTATION_PARAMS,
): ExternalReputationResult {
  const scored = sources.map((s) => scoreSource(s, now, p));
  let mass = 0;
  let weighted = 0;
  for (const s of scored) {
    const m = p.verificationWeight[s.verification] * s.effectiveTotal;
    mass += m;
    weighted += m * s.lowerBound;
  }
  if (mass <= 0) {
    return { model: EXTERNAL_REPUTATION_MODEL, score: null, evidence: 0, sources: scored };
  }
  const raw = weighted / mass;
  const score = (p.priorWeight * p.priorMean + mass * raw) / (p.priorWeight + mass);
  return { model: EXTERNAL_REPUTATION_MODEL, score, evidence: mass, sources: scored };
}

/// Share of the Karwan composite that imported evidence may take. It helps a
/// newcomer start and fades as the wallet settles deals on Karwan, so earned
/// history always ends up dominating.
export function importedFactorWeight(
  settledKarwanDeals: number,
  p: ExternalReputationParams = EXTERNAL_REPUTATION_PARAMS,
): number {
  return p.maxImportedWeight * Math.exp(-Math.max(0, settledKarwanDeals) / p.importedFadeDeals);
}
