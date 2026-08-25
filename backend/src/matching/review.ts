import { isDeepStrictEqual } from 'node:util';
import type { SqlExecutor } from '../db/migrations.js';

export type MatchingAuditReviewDecision =
  | 'retain_legacy'
  | 'accept_shadow'
  | 'needs_more_evidence';

export interface MatchingAuditReview {
  reviewId: string;
  observationKey: string;
  decision: MatchingAuditReviewDecision;
  reviewer: string;
  note?: string;
  createdAt: number;
}

export interface MatchingAuditReviewStore {
  record(input: MatchingAuditReview): Promise<MatchingAuditReview>;
  list(input?: { observationKey?: string; limit?: number }): Promise<MatchingAuditReview[]>;
}

function validateReview(input: MatchingAuditReview): void {
  if (!input.reviewId.trim()) throw new Error('matching review id is required');
  if (!input.observationKey.trim()) throw new Error('matching observation key is required');
  if (!input.reviewer.trim()) throw new Error('matching reviewer is required');
  if (input.note !== undefined && input.note.length > 500) {
    throw new Error('matching review note is too long');
  }
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
    throw new Error('matching review createdAt must be a non-negative integer');
  }
}

function clone(input: MatchingAuditReview): MatchingAuditReview {
  return structuredClone(input);
}

function sameReviewContent(a: MatchingAuditReview, b: MatchingAuditReview): boolean {
  return a.reviewId === b.reviewId
    && a.observationKey === b.observationKey
    && a.decision === b.decision
    && a.reviewer === b.reviewer
    && a.note === b.note;
}

export class InMemoryMatchingAuditReviewStore implements MatchingAuditReviewStore {
  private readonly byObservation = new Map<string, MatchingAuditReview>();
  private readonly byReviewId = new Map<string, MatchingAuditReview>();

  async record(input: MatchingAuditReview): Promise<MatchingAuditReview> {
    validateReview(input);
    const reused = this.byReviewId.get(input.reviewId);
    if (reused) {
      if (!sameReviewContent(reused, input)) {
        throw new Error(`matching review id conflict: ${input.reviewId}`);
      }
      return clone(reused);
    }
    const prior = this.byObservation.get(input.observationKey);
    if (prior) {
      if (!isDeepStrictEqual(prior, input)) {
        throw new Error(`matching review conflict: ${input.observationKey}`);
      }
      return clone(prior);
    }
    const stored = clone(input);
    this.byObservation.set(input.observationKey, stored);
    this.byReviewId.set(input.reviewId, stored);
    return clone(stored);
  }

  async list(input: { observationKey?: string; limit?: number } = {}): Promise<MatchingAuditReview[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    return [...this.byObservation.values()]
      .filter((review) => !input.observationKey || review.observationKey === input.observationKey)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(clone);
  }
}

interface MatchingAuditReviewRow extends Record<string, unknown> {
  review_id: string;
  observation_key: string;
  decision: MatchingAuditReviewDecision;
  reviewer: string;
  note: string | null;
  created_at: number | string;
}

function fromRow(row: MatchingAuditReviewRow): MatchingAuditReview {
  const createdAt = Number(row.created_at);
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new Error('unsafe matching review created_at');
  }
  return {
    reviewId: row.review_id,
    observationKey: row.observation_key,
    decision: row.decision,
    reviewer: row.reviewer,
    ...(row.note === null ? {} : { note: row.note }),
    createdAt,
  };
}

export class PostgresMatchingAuditReviewStore implements MatchingAuditReviewStore {
  constructor(private readonly executor: SqlExecutor) {}

  async record(input: MatchingAuditReview): Promise<MatchingAuditReview> {
    validateReview(input);
    const byId = await this.executor.query<MatchingAuditReviewRow>(
      'SELECT * FROM matching_audit_reviews_v2 WHERE review_id = $1',
      [input.reviewId],
    );
    if (byId.rows[0]) {
      const prior = fromRow(byId.rows[0]);
      if (!sameReviewContent(prior, input)) throw new Error(`matching review id conflict: ${input.reviewId}`);
      return prior;
    }
    const inserted = await this.executor.query<MatchingAuditReviewRow>(
      `INSERT INTO matching_audit_reviews_v2 (
         review_id, observation_key, decision, reviewer, note, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [input.reviewId, input.observationKey, input.decision, input.reviewer, input.note ?? null, input.createdAt],
    );
    if (inserted.rows[0]) return fromRow(inserted.rows[0]);
    const existingById = await this.executor.query<MatchingAuditReviewRow>(
      'SELECT * FROM matching_audit_reviews_v2 WHERE review_id = $1',
      [input.reviewId],
    );
    if (existingById.rows[0]) {
      const prior = fromRow(existingById.rows[0]);
      if (!sameReviewContent(prior, input)) throw new Error(`matching review id conflict: ${input.reviewId}`);
      return prior;
    }
    const existing = await this.executor.query<MatchingAuditReviewRow>(
      'SELECT * FROM matching_audit_reviews_v2 WHERE observation_key = $1',
      [input.observationKey],
    );
    if (!existing.rows[0]) throw new Error(`matching review insert lost: ${input.observationKey}`);
    const prior = fromRow(existing.rows[0]);
    if (!isDeepStrictEqual(prior, input)) throw new Error(`matching review conflict: ${input.observationKey}`);
    return prior;
  }

  async list(input: { observationKey?: string; limit?: number } = {}): Promise<MatchingAuditReview[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (input.observationKey) {
      params.push(input.observationKey);
      clauses.push(`observation_key = $${params.length}`);
    }
    params.push(limit);
    const result = await this.executor.query<MatchingAuditReviewRow>(
      `SELECT * FROM matching_audit_reviews_v2
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(fromRow);
  }
}
