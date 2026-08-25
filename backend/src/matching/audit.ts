import { isDeepStrictEqual } from 'node:util';
import type { SqlExecutor } from '../db/migrations.js';
import type { MatchingEvaluation } from './types.js';

export type MatchingAuditSource = 'buyer-bids' | 'listing-brief';
export type MatchingAuditStatus = 'matched' | 'diverged';

export interface MatchingSemanticReviewCandidate {
  candidateId: string;
  candidateVersion: number;
}

/** Optional measurements. Missing values mean that side was not measured. */
export interface MatchingAuditTelemetry {
  legacyLatencyMs?: number;
  shadowLatencyMs?: number;
  legacyPaidCallCount?: number;
  shadowPaidCallCount?: number;
}

export interface MatchingAuditTelemetrySummary {
  latency: {
    samples: number;
    legacySamples: number;
    shadowSamples: number;
    legacyTotalMs: number;
    shadowTotalMs: number;
    legacyAverageMs: number | null;
    shadowAverageMs: number | null;
  };
  paidCalls: {
    samples: number;
    pairedSamples: number;
    legacySamples: number;
    shadowSamples: number;
    legacyTotal: number;
    shadowTotal: number;
    delta: number | null;
  };
}

export interface MatchingAuditObservation {
  observationKey: string;
  source: MatchingAuditSource;
  mandateId: string;
  mandateVersion: number;
  legacyCandidateIds: string[];
  shadowCandidateIds: string[];
  evaluations: MatchingEvaluation[];
  /** Candidate/version pointers awaiting an optional semantic provider. */
  semanticReviewCandidates?: MatchingSemanticReviewCandidate[];
  telemetry?: MatchingAuditTelemetry;
  observedAt: number;
}

export interface MatchingAuditRecord extends MatchingAuditObservation {
  legacyWinnerId?: string;
  shadowWinnerId?: string;
  comparisonStatus: MatchingAuditStatus;
}

export interface MatchingAuditSummary {
  total: number;
  bySource: Record<MatchingAuditSource, number>;
  comparison: Record<MatchingAuditStatus, number>;
  telemetry?: MatchingAuditTelemetrySummary;
  /** Number of candidate snapshots awaiting a semantic review result. */
  semanticReviewCandidates?: number;
  /** Divergences where the legacy winner is absent from the shadow set. */
  falseNegativeReviews?: number;
  /** Sum of uncertain transaction-evidence records used by matching evaluations. */
  uncertainEvidenceUses?: number;
}

export type MatchingAuditReviewReason =
  | 'winner-divergence'
  | 'false-negative'
  | 'semantic-review-pending';

export interface MatchingAuditReviewItem {
  observationKey: string;
  source: MatchingAuditSource;
  mandateId: string;
  mandateVersion: number;
  observedAt: number;
  reasons: MatchingAuditReviewReason[];
  legacyWinnerId?: string;
  shadowWinnerId?: string;
}

/**
 * Build the bounded operator queue for shadow disagreements. This pure
 * projection does not acknowledge, mutate, or authorize a winner.
 */
export function buildMatchingAuditReviewQueue(
  records: readonly MatchingAuditRecord[],
  limit = 100,
): MatchingAuditReviewItem[] {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  return records
    .flatMap((record) => {
      const legacyWinnerId = record.legacyWinnerId;
      const falseNegative = !!legacyWinnerId
        && !record.shadowCandidateIds.includes(legacyWinnerId);
      const reasons: MatchingAuditReviewReason[] = [];
      if (record.comparisonStatus === 'diverged') reasons.push('winner-divergence');
      if (falseNegative) reasons.push('false-negative');
      if ((record.semanticReviewCandidates?.length ?? 0) > 0) {
        reasons.push('semantic-review-pending');
      }
      if (reasons.length === 0) return [];
      return [{
        observationKey: record.observationKey,
        source: record.source,
        mandateId: record.mandateId,
        mandateVersion: record.mandateVersion,
        observedAt: record.observedAt,
        reasons,
        ...(legacyWinnerId ? { legacyWinnerId } : {}),
        ...(record.shadowWinnerId ? { shadowWinnerId: record.shadowWinnerId } : {}),
      }];
    })
    .sort((a, b) => b.observedAt - a.observedAt)
    .slice(0, boundedLimit)
    .map((item) => structuredClone(item));
}

export interface MatchingAuditStore {
  record(input: MatchingAuditObservation): Promise<MatchingAuditRecord>;
  get(observationKey: string): Promise<MatchingAuditRecord | null>;
  list(input?: {
    source?: MatchingAuditSource;
    comparison?: MatchingAuditStatus;
    limit?: number;
  }): Promise<MatchingAuditRecord[]>;
  summary(): Promise<MatchingAuditSummary>;
}

function validateTelemetry(telemetry: MatchingAuditTelemetry | undefined): void {
  if (!telemetry) return;
  for (const [key, value] of Object.entries(telemetry)) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`matching telemetry ${key} must be a non-negative finite number`);
    }
    if (key.endsWith('PaidCallCount') && !Number.isSafeInteger(value)) {
      throw new Error(`matching telemetry ${key} must be an integer`);
    }
  }
}

function comparableRecord(record: MatchingAuditRecord): MatchingAuditRecord {
  const { telemetry: _telemetry, ...withoutTelemetry } = record;
  return withoutTelemetry;
}

function emptyTelemetrySummary(): MatchingAuditTelemetrySummary {
  return {
    latency: {
      samples: 0,
      legacySamples: 0,
      shadowSamples: 0,
      legacyTotalMs: 0,
      shadowTotalMs: 0,
      legacyAverageMs: null,
      shadowAverageMs: null,
    },
    paidCalls: {
      samples: 0,
      pairedSamples: 0,
      legacySamples: 0,
      shadowSamples: 0,
      legacyTotal: 0,
      shadowTotal: 0,
      delta: null,
    },
  };
}

function summarizeTelemetry(
  records: readonly MatchingAuditRecord[],
): MatchingAuditTelemetrySummary {
  const summary = emptyTelemetrySummary();
  for (const record of records) {
    const telemetry = record.telemetry;
    if (!telemetry) continue;
    const legacyLatency = telemetry.legacyLatencyMs;
    const shadowLatency = telemetry.shadowLatencyMs;
    if (legacyLatency !== undefined) {
      summary.latency.legacySamples += 1;
      summary.latency.legacyTotalMs += legacyLatency;
    }
    if (shadowLatency !== undefined) {
      summary.latency.shadowSamples += 1;
      summary.latency.shadowTotalMs += shadowLatency;
    }
    if (legacyLatency !== undefined || shadowLatency !== undefined) {
      summary.latency.samples += 1;
    }

    const legacyPaidCalls = telemetry.legacyPaidCallCount;
    const shadowPaidCalls = telemetry.shadowPaidCallCount;
    if (legacyPaidCalls !== undefined) {
      summary.paidCalls.legacySamples += 1;
      summary.paidCalls.legacyTotal += legacyPaidCalls;
    }
    if (shadowPaidCalls !== undefined) {
      summary.paidCalls.shadowSamples += 1;
      summary.paidCalls.shadowTotal += shadowPaidCalls;
    }
    if (legacyPaidCalls !== undefined || shadowPaidCalls !== undefined) {
      summary.paidCalls.samples += 1;
    }
    if (legacyPaidCalls !== undefined && shadowPaidCalls !== undefined) {
      summary.paidCalls.pairedSamples += 1;
      summary.paidCalls.delta = (summary.paidCalls.delta ?? 0)
        + shadowPaidCalls - legacyPaidCalls;
    }
  }
  summary.latency.legacyAverageMs = summary.latency.legacySamples > 0
    ? summary.latency.legacyTotalMs / summary.latency.legacySamples
    : null;
  summary.latency.shadowAverageMs = summary.latency.shadowSamples > 0
    ? summary.latency.shadowTotalMs / summary.latency.shadowSamples
    : null;
  return summary;
}

function classify(input: MatchingAuditObservation): MatchingAuditRecord {
  validateTelemetry(input.telemetry);
  const legacyWinnerId = input.legacyCandidateIds[0];
  const shadowWinnerId = input.shadowCandidateIds[0];
  return {
    ...structuredClone(input),
    ...(legacyWinnerId ? { legacyWinnerId } : {}),
    ...(shadowWinnerId ? { shadowWinnerId } : {}),
    comparisonStatus: legacyWinnerId === shadowWinnerId ? 'matched' : 'diverged',
  };
}

export class InMemoryMatchingAuditStore implements MatchingAuditStore {
  private readonly records = new Map<string, MatchingAuditRecord>();

  async record(input: MatchingAuditObservation): Promise<MatchingAuditRecord> {
    const next = classify(input);
    const prior = this.records.get(input.observationKey);
    if (prior) {
      if (!isDeepStrictEqual(comparableRecord(prior), comparableRecord(next))) {
        throw new Error(`matching audit conflict: ${input.observationKey}`);
      }
      return structuredClone(prior);
    }
    this.records.set(input.observationKey, next);
    return structuredClone(next);
  }

  async get(observationKey: string): Promise<MatchingAuditRecord | null> {
    const record = this.records.get(observationKey);
    return record ? structuredClone(record) : null;
  }

  async list(input: {
    source?: MatchingAuditSource;
    comparison?: MatchingAuditStatus;
    limit?: number;
  } = {}): Promise<MatchingAuditRecord[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    return [...this.records.values()]
      .filter((record) => !input.source || record.source === input.source)
      .filter((record) => !input.comparison || record.comparisonStatus === input.comparison)
      .sort((a, b) => b.observedAt - a.observedAt)
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }

  async summary(): Promise<MatchingAuditSummary> {
    const records = [...this.records.values()];
    return {
      total: records.length,
      bySource: {
        'buyer-bids': records.filter((record) => record.source === 'buyer-bids').length,
        'listing-brief': records.filter((record) => record.source === 'listing-brief').length,
      },
      comparison: {
        matched: records.filter((record) => record.comparisonStatus === 'matched').length,
        diverged: records.filter((record) => record.comparisonStatus === 'diverged').length,
      },
      semanticReviewCandidates: records.reduce(
        (total, record) => total + (record.semanticReviewCandidates?.length ?? 0),
        0,
      ),
      falseNegativeReviews: records.filter((record) =>
        !!record.legacyWinnerId && !record.shadowCandidateIds.includes(record.legacyWinnerId),
      ).length,
      uncertainEvidenceUses: records.reduce(
        (total, record) => total + record.evaluations.reduce(
          (evaluationTotal, evaluation) => evaluationTotal + Math.max(
            0,
            Number.isFinite(evaluation.evidence.uncertainTransactionCount)
              ? evaluation.evidence.uncertainTransactionCount
              : 0,
          ),
          0,
        ),
        0,
      ),
      telemetry: summarizeTelemetry(records),
    };
  }
}

interface MatchingAuditRow extends Record<string, unknown> {
  observation_key: string;
  source: MatchingAuditSource;
  mandate_id: string;
  mandate_version: string | number;
  legacy_winner_id: string | null;
  shadow_winner_id: string | null;
  comparison_status: MatchingAuditStatus;
  candidate_count: string | number;
  observed_at: string | number;
  data: MatchingAuditObservation;
}

export class PostgresMatchingAuditStore implements MatchingAuditStore {
  constructor(private readonly executor: SqlExecutor) {}

  async record(input: MatchingAuditObservation): Promise<MatchingAuditRecord> {
    const next = classify(input);
    const inserted = await this.executor.query<MatchingAuditRow>(
      `INSERT INTO matching_engine_audits_v2 (
         observation_key, source, mandate_id, mandate_version,
         legacy_winner_id, shadow_winner_id, comparison_status,
         candidate_count, observed_at, data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (observation_key) DO NOTHING
       RETURNING *`,
      [
        next.observationKey,
        next.source,
        next.mandateId,
        next.mandateVersion,
        next.legacyWinnerId ?? null,
        next.shadowWinnerId ?? null,
        next.comparisonStatus,
        next.evaluations.length,
        next.observedAt,
        next,
      ],
    );
    if (inserted.rows[0]) return fromRow(inserted.rows[0]);
    const existing = await this.executor.query<MatchingAuditRow>(
      'SELECT * FROM matching_engine_audits_v2 WHERE observation_key = $1',
      [next.observationKey],
    );
    if (!existing.rows[0]) throw new Error(`matching audit insert lost: ${next.observationKey}`);
    const prior = fromRow(existing.rows[0]);
    if (!isDeepStrictEqual(comparableRecord(prior), comparableRecord(next))) {
      throw new Error(`matching audit conflict: ${next.observationKey}`);
    }
    return prior;
  }

  async get(observationKey: string): Promise<MatchingAuditRecord | null> {
    const result = await this.executor.query<MatchingAuditRow>(
      'SELECT * FROM matching_engine_audits_v2 WHERE observation_key = $1',
      [observationKey],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async list(input: {
    source?: MatchingAuditSource;
    comparison?: MatchingAuditStatus;
    limit?: number;
  } = {}): Promise<MatchingAuditRecord[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.source) {
      params.push(input.source);
      clauses.push(`source = $${params.length}`);
    }
    if (input.comparison) {
      params.push(input.comparison);
      clauses.push(`comparison_status = $${params.length}`);
    }
    params.push(limit);
    const result = await this.executor.query<MatchingAuditRow>(
      `SELECT * FROM matching_engine_audits_v2 ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY observed_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(fromRow);
  }

  async summary(): Promise<MatchingAuditSummary> {
    const result = await this.executor.query<{
      total: string | number;
      buyer_count: string | number;
      listing_count: string | number;
      matched_count: string | number;
      diverged_count: string | number;
      semantic_review_candidates: string | number;
      false_negative_reviews: string | number;
      uncertain_evidence_uses: string | number;
      legacy_latency_samples: string | number;
      shadow_latency_samples: string | number;
      latency_samples: string | number;
      legacy_latency_total: string | number;
      shadow_latency_total: string | number;
      legacy_paid_samples: string | number;
      shadow_paid_samples: string | number;
      paid_samples: string | number;
      legacy_paid_total: string | number;
      shadow_paid_total: string | number;
      paired_paid_samples: string | number;
      paired_paid_delta: string | number;
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE source = 'buyer-bids') AS buyer_count,
         COUNT(*) FILTER (WHERE source = 'listing-brief') AS listing_count,
         COUNT(*) FILTER (WHERE comparison_status = 'matched') AS matched_count,
         COUNT(*) FILTER (WHERE comparison_status = 'diverged') AS diverged_count,
         COALESCE(SUM(jsonb_array_length(COALESCE(data->'semanticReviewCandidates', '[]'::jsonb))), 0)
           AS semantic_review_candidates,
         COUNT(*) FILTER (
           WHERE legacy_winner_id IS NOT NULL
             AND NOT (COALESCE(data->'shadowCandidateIds', '[]'::jsonb) ? legacy_winner_id)
         ) AS false_negative_reviews,
         COALESCE(SUM(
           CASE WHEN jsonb_typeof(data->'evaluations') = 'array' THEN (
             SELECT COALESCE(SUM(GREATEST(
               CASE
                 WHEN jsonb_typeof(evaluation->'evidence'->'uncertainTransactionCount') = 'number'
                 THEN (evaluation->'evidence'->>'uncertainTransactionCount')::double precision
                 ELSE 0
               END,
               0
             )), 0)
             FROM jsonb_array_elements(data->'evaluations') AS evaluation
           ) ELSE 0 END
         ), 0) AS uncertain_evidence_uses,
         COUNT(*) FILTER (WHERE jsonb_typeof(data->'telemetry'->'legacyLatencyMs') = 'number')
           AS legacy_latency_samples,
         COUNT(*) FILTER (WHERE jsonb_typeof(data->'telemetry'->'shadowLatencyMs') = 'number')
           AS shadow_latency_samples,
         COUNT(*) FILTER (
           WHERE jsonb_typeof(data->'telemetry'->'legacyLatencyMs') = 'number'
              OR jsonb_typeof(data->'telemetry'->'shadowLatencyMs') = 'number'
         ) AS latency_samples,
         COALESCE(SUM(CASE WHEN jsonb_typeof(data->'telemetry'->'legacyLatencyMs') = 'number'
           THEN (data->'telemetry'->>'legacyLatencyMs')::double precision ELSE 0 END), 0)
           AS legacy_latency_total,
         COALESCE(SUM(CASE WHEN jsonb_typeof(data->'telemetry'->'shadowLatencyMs') = 'number'
           THEN (data->'telemetry'->>'shadowLatencyMs')::double precision ELSE 0 END), 0)
           AS shadow_latency_total,
         COUNT(*) FILTER (WHERE jsonb_typeof(data->'telemetry'->'legacyPaidCallCount') = 'number')
           AS legacy_paid_samples,
         COUNT(*) FILTER (WHERE jsonb_typeof(data->'telemetry'->'shadowPaidCallCount') = 'number')
           AS shadow_paid_samples,
         COUNT(*) FILTER (
           WHERE jsonb_typeof(data->'telemetry'->'legacyPaidCallCount') = 'number'
              OR jsonb_typeof(data->'telemetry'->'shadowPaidCallCount') = 'number'
         ) AS paid_samples,
         COALESCE(SUM(CASE WHEN jsonb_typeof(data->'telemetry'->'legacyPaidCallCount') = 'number'
           THEN (data->'telemetry'->>'legacyPaidCallCount')::double precision ELSE 0 END), 0)
           AS legacy_paid_total,
         COALESCE(SUM(CASE WHEN jsonb_typeof(data->'telemetry'->'shadowPaidCallCount') = 'number'
           THEN (data->'telemetry'->>'shadowPaidCallCount')::double precision ELSE 0 END), 0)
           AS shadow_paid_total,
         COUNT(*) FILTER (
           WHERE jsonb_typeof(data->'telemetry'->'legacyPaidCallCount') = 'number'
             AND jsonb_typeof(data->'telemetry'->'shadowPaidCallCount') = 'number'
         ) AS paired_paid_samples,
         COALESCE(SUM(CASE
           WHEN jsonb_typeof(data->'telemetry'->'legacyPaidCallCount') = 'number'
            AND jsonb_typeof(data->'telemetry'->'shadowPaidCallCount') = 'number'
           THEN (data->'telemetry'->>'shadowPaidCallCount')::double precision
              - (data->'telemetry'->>'legacyPaidCallCount')::double precision
           ELSE 0 END), 0) AS paired_paid_delta
       FROM matching_engine_audits_v2`,
    );
    const row = result.rows[0] ?? {
      total: 0,
      buyer_count: 0,
      listing_count: 0,
      matched_count: 0,
      diverged_count: 0,
      semantic_review_candidates: 0,
      false_negative_reviews: 0,
      uncertain_evidence_uses: 0,
      legacy_latency_samples: 0,
      shadow_latency_samples: 0,
      latency_samples: 0,
      legacy_latency_total: 0,
      shadow_latency_total: 0,
      legacy_paid_samples: 0,
      shadow_paid_samples: 0,
      paid_samples: 0,
      legacy_paid_total: 0,
      shadow_paid_total: 0,
      paired_paid_samples: 0,
      paired_paid_delta: 0,
    };
    const legacyLatencySamples = Number(row.legacy_latency_samples ?? 0);
    const shadowLatencySamples = Number(row.shadow_latency_samples ?? 0);
    const latencySamples = Number(row.latency_samples ?? 0);
    const legacyLatencyTotal = Number(row.legacy_latency_total ?? 0);
    const shadowLatencyTotal = Number(row.shadow_latency_total ?? 0);
    const legacyPaidSamples = Number(row.legacy_paid_samples ?? 0);
    const shadowPaidSamples = Number(row.shadow_paid_samples ?? 0);
    const paidSamples = Number(row.paid_samples ?? 0);
    const pairedPaidSamples = Number(row.paired_paid_samples ?? 0);
    return {
      total: Number(row.total),
      bySource: { 'buyer-bids': Number(row.buyer_count), 'listing-brief': Number(row.listing_count) },
      comparison: { matched: Number(row.matched_count), diverged: Number(row.diverged_count) },
      semanticReviewCandidates: Number(row.semantic_review_candidates ?? 0),
      falseNegativeReviews: Number(row.false_negative_reviews ?? 0),
      uncertainEvidenceUses: Number(row.uncertain_evidence_uses ?? 0),
      telemetry: {
        latency: {
          samples: latencySamples,
          legacySamples: legacyLatencySamples,
          shadowSamples: shadowLatencySamples,
          legacyTotalMs: legacyLatencyTotal,
          shadowTotalMs: shadowLatencyTotal,
          legacyAverageMs: legacyLatencySamples > 0 ? legacyLatencyTotal / legacyLatencySamples : null,
          shadowAverageMs: shadowLatencySamples > 0 ? shadowLatencyTotal / shadowLatencySamples : null,
        },
        paidCalls: {
          samples: paidSamples,
          pairedSamples: pairedPaidSamples,
          legacySamples: legacyPaidSamples,
          shadowSamples: shadowPaidSamples,
          legacyTotal: Number(row.legacy_paid_total ?? 0),
          shadowTotal: Number(row.shadow_paid_total ?? 0),
          delta: pairedPaidSamples > 0 ? Number(row.paired_paid_delta ?? 0) : null,
        },
      },
    };
  }
}

function fromRow(row: MatchingAuditRow): MatchingAuditRecord {
  const data = row.data;
  validateTelemetry(data.telemetry);
  return {
    ...structuredClone(data),
    legacyWinnerId: row.legacy_winner_id ?? undefined,
    shadowWinnerId: row.shadow_winner_id ?? undefined,
    comparisonStatus: row.comparison_status,
  };
}
