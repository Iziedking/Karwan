import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { MatchProposal } from '../db/matchProposals.js';
import type { SqlExecutor } from '../db/migrations.js';

export interface MatchProposalRevisionObservation {
  proposal: MatchProposal;
  observedAt: number;
}

export interface MatchProposalRevisionRecord {
  id: string;
  jobId: string;
  revision: number;
  proposalFingerprint: string;
  observedAt: number;
  proposal: MatchProposal;
}

export interface MatchProposalRevisionStore {
  observe(input: MatchProposalRevisionObservation): Promise<{
    record: MatchProposalRevisionRecord;
    created: boolean;
  }>;
  get(jobId: string, revision: number): Promise<MatchProposalRevisionRecord | null>;
  list(jobId: string, limit?: number): Promise<MatchProposalRevisionRecord[]>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function normalizedProposal(input: MatchProposal): MatchProposal {
  const proposal = structuredClone(input);
  const normalized: MatchProposal = {
    ...proposal,
    jobId: proposal.jobId.trim().toLowerCase(),
    buyerUser: proposal.buyerUser.trim().toLowerCase(),
    buyerAgent: proposal.buyerAgent.trim().toLowerCase(),
    sellerUser: proposal.sellerUser.trim().toLowerCase(),
    sellerAgent: proposal.sellerAgent.trim().toLowerCase(),
  };
  for (const [key, value] of Object.entries({
    jobId: normalized.jobId,
    buyerUser: normalized.buyerUser,
    buyerAgent: normalized.buyerAgent,
    sellerUser: normalized.sellerUser,
    sellerAgent: normalized.sellerAgent,
  })) {
    if (!value) throw new Error(`proposal ${key} is required`);
  }
  if (!Number.isSafeInteger(normalized.proposedAt) || normalized.proposedAt < 0) {
    throw new Error('proposal proposedAt must be a non-negative safe integer');
  }
  return normalized;
}

export function matchProposalFingerprint(proposal: MatchProposal): string {
  const normalized = normalizedProposal(proposal);
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(normalized)))
    .digest('hex');
}

function normalizedObservation(input: MatchProposalRevisionObservation): {
  proposal: MatchProposal;
  observedAt: number;
  proposalFingerprint: string;
} {
  if (!Number.isSafeInteger(input.observedAt) || input.observedAt < 0) {
    throw new Error('proposal observation timestamp must be a non-negative safe integer');
  }
  const proposal = normalizedProposal(input.proposal);
  return {
    proposal,
    observedAt: input.observedAt,
    proposalFingerprint: matchProposalFingerprint(proposal),
  };
}

function cloneRecord(record: MatchProposalRevisionRecord): MatchProposalRevisionRecord {
  return structuredClone(record);
}

export class InMemoryMatchProposalRevisionStore implements MatchProposalRevisionStore {
  private readonly records = new Map<string, MatchProposalRevisionRecord[]>();

  async observe(input: MatchProposalRevisionObservation): Promise<{
    record: MatchProposalRevisionRecord;
    created: boolean;
  }> {
    const next = normalizedObservation(input);
    const history = this.records.get(next.proposal.jobId) ?? [];
    const prior = history.find((record) => record.proposalFingerprint === next.proposalFingerprint);
    if (prior) return { record: cloneRecord(prior), created: false };
    const revision = (history.at(-1)?.revision ?? 0) + 1;
    const record: MatchProposalRevisionRecord = {
      id: `proposal-revision:${next.proposal.jobId}:${revision}`,
      jobId: next.proposal.jobId,
      revision,
      proposalFingerprint: next.proposalFingerprint,
      observedAt: next.observedAt,
      proposal: next.proposal,
    };
    history.push(record);
    this.records.set(next.proposal.jobId, history);
    return { record: cloneRecord(record), created: true };
  }

  async get(jobId: string, revision: number): Promise<MatchProposalRevisionRecord | null> {
    const record = this.records.get(jobId.trim().toLowerCase())?.find((entry) => entry.revision === revision);
    return record ? cloneRecord(record) : null;
  }

  async list(jobId: string, limit = 100): Promise<MatchProposalRevisionRecord[]> {
    const bounded = Math.max(1, Math.min(500, Math.floor(limit)));
    return (this.records.get(jobId.trim().toLowerCase()) ?? [])
      .slice()
      .sort((a, b) => b.revision - a.revision)
      .slice(0, bounded)
      .map(cloneRecord);
  }
}

interface ProposalRevisionRow extends Record<string, unknown> {
  id: string;
  job_id: string;
  revision: number | string;
  proposal_fingerprint: string;
  observed_at: number | string;
  data: unknown;
}

function rowToRecord(row: ProposalRevisionRow): MatchProposalRevisionRecord {
  const proposal = normalizedProposal(row.data as MatchProposal);
  const fingerprint = matchProposalFingerprint(proposal);
  if (
    String(row.id) !== `proposal-revision:${proposal.jobId}:${Number(row.revision)}`
    || String(row.job_id) !== proposal.jobId
    || String(row.proposal_fingerprint) !== fingerprint
  ) {
    throw new Error('match proposal revision integrity mismatch');
  }
  return {
    id: String(row.id),
    jobId: proposal.jobId,
    revision: Number(row.revision),
    proposalFingerprint: fingerprint,
    observedAt: Number(row.observed_at),
    proposal,
  };
}

export class PostgresMatchProposalRevisionStore implements MatchProposalRevisionStore {
  constructor(private readonly executor: SqlExecutor) {}

  async observe(input: MatchProposalRevisionObservation): Promise<{
    record: MatchProposalRevisionRecord;
    created: boolean;
  }> {
    const next = normalizedObservation(input);
    const inserted = await this.executor.query<ProposalRevisionRow>(
      `WITH job_lock AS (
         SELECT pg_advisory_xact_lock(hashtext($1))
       ), next_revision AS (
         SELECT COALESCE(MAX(revision), 0) + 1 AS revision
         FROM match_proposal_revisions_v2, job_lock
         WHERE job_id = $1
       )
       INSERT INTO match_proposal_revisions_v2 (
         id, job_id, revision, proposal_fingerprint, observed_at, data
       )
       SELECT ('proposal-revision:' || $1 || ':' || next_revision.revision),
         $1, next_revision.revision, $2, $3, $4
       FROM next_revision
       ON CONFLICT (job_id, proposal_fingerprint) DO NOTHING
       RETURNING *`,
      [
        next.proposal.jobId,
        next.proposalFingerprint,
        next.observedAt,
        next.proposal,
      ],
    );
    if (inserted.rows[0]) {
      const row = inserted.rows[0];
      return { record: rowToRecord(row), created: true };
    }
    const existing = await this.executor.query<ProposalRevisionRow>(
      `SELECT * FROM match_proposal_revisions_v2
       WHERE job_id = $1 AND proposal_fingerprint = $2`,
      [next.proposal.jobId, next.proposalFingerprint],
    );
    if (!existing.rows[0]) throw new Error('match proposal revision insert was not observable');
    const record = rowToRecord(existing.rows[0]);
    if (!isDeepStrictEqual(record.proposal, next.proposal)) {
      throw new Error(`match proposal revision conflict: ${next.proposal.jobId}`);
    }
    return { record, created: false };
  }

  async get(jobId: string, revision: number): Promise<MatchProposalRevisionRecord | null> {
    const result = await this.executor.query<ProposalRevisionRow>(
      'SELECT * FROM match_proposal_revisions_v2 WHERE job_id = $1 AND revision = $2',
      [jobId.trim().toLowerCase(), revision],
    );
    return result.rows[0] ? rowToRecord(result.rows[0]) : null;
  }

  async list(jobId: string, limit = 100): Promise<MatchProposalRevisionRecord[]> {
    const bounded = Math.max(1, Math.min(500, Math.floor(limit)));
    const result = await this.executor.query<ProposalRevisionRow>(
      `SELECT * FROM match_proposal_revisions_v2
       WHERE job_id = $1 ORDER BY revision DESC LIMIT $2`,
      [jobId.trim().toLowerCase(), bounded],
    );
    return result.rows.map(rowToRecord);
  }
}
