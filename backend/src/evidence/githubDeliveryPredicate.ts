import { createHash } from 'node:crypto';

/**
 * Pure GitHub delivery predicate.
 *
 * The sandbox CLI and a future CRE handler are the two consumers. This module
 * has no HTTP, GitHub SDK, secret, wallet, or payment dependency so both can
 * rebuild the same decision from a canonical API snapshot.
 */

export const GITHUB_DELIVERY_POLICY_VERSION = 'github-delivery-v1';

export type GitHubDeliveryDecisionCode = 'PASS' | 'MISMATCH' | 'UNAVAILABLE';

export interface GitHubDeliveryCriteria {
  repositoryId: number;
  baseBranch: string;
  expectedSubmitter: string;
  requireMerged: boolean;
  requiredCheckName: string;
  trustedAppId: number;
}

export interface GitHubCheckEvidence {
  name: string;
  appId: number | null;
  conclusion: string | null;
  sha: string;
}

export interface GitHubDeliveryEvidence {
  repositoryId: number | null;
  baseBranch: string | null;
  deliverySha: string | null;
  submitter: string | null;
  merged: boolean | null;
  checks: readonly GitHubCheckEvidence[] | null;
  sourceFetchedAtUnix: number | null;
}

export interface GitHubDeliveryResult {
  decisionCode: GitHubDeliveryDecisionCode;
  reasonCode:
    | 'DELIVERY_ACCEPTED'
    | 'SOURCE_UNAVAILABLE'
    | 'REPOSITORY_MISMATCH'
    | 'BASE_BRANCH_MISMATCH'
    | 'DELIVERY_SHA_MISSING'
    | 'SUBMITTER_MISMATCH'
    | 'MERGE_REQUIRED'
    | 'CHECK_MISSING'
    | 'CHECK_SHA_MISMATCH'
    | 'CHECK_APP_MISMATCH'
    | 'CHECK_NOT_SUCCESSFUL';
  policyVersion: string;
  evidenceDigest: string;
  criteriaDigest: string;
  deliverySha: string | null;
}

function stableJson(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('evidence digest only accepts finite JSON numbers');
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('evidence digest only accepts JSON values');
  return encoded;
}

function digest(value: object): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function normalizeBranch(value: string): string {
  return value.trim().replace(/^refs\/heads\//, '');
}

function normalizeSha(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSubmitter(value: string): string {
  return value.trim().toLowerCase();
}

function result(
  decisionCode: GitHubDeliveryDecisionCode,
  reasonCode: GitHubDeliveryResult['reasonCode'],
  criteria: GitHubDeliveryCriteria,
  evidence: GitHubDeliveryEvidence,
): GitHubDeliveryResult {
  return {
    decisionCode,
    reasonCode,
    policyVersion: GITHUB_DELIVERY_POLICY_VERSION,
    evidenceDigest: digest(evidence),
    criteriaDigest: digest(criteria),
    deliverySha: evidence.deliverySha ? normalizeSha(evidence.deliverySha) : null,
  };
}

/**
 * Evaluate one immutable GitHub API snapshot against the accepted milestone.
 * A missing source is unavailable, not a failed delivery and never a trust
 * penalty. A changed SHA is a mismatch and cannot reuse an older result.
 */
export function evaluateGitHubDelivery(
  criteria: GitHubDeliveryCriteria,
  evidence: GitHubDeliveryEvidence,
): GitHubDeliveryResult {
  if (
    evidence.repositoryId === null
    || evidence.baseBranch === null
    || evidence.deliverySha === null
    || evidence.submitter === null
    || evidence.merged === null
    || evidence.checks === null
    || evidence.sourceFetchedAtUnix === null
  ) {
    return result('UNAVAILABLE', 'SOURCE_UNAVAILABLE', criteria, evidence);
  }

  if (!Number.isSafeInteger(evidence.repositoryId) || evidence.repositoryId !== criteria.repositoryId) {
    return result('MISMATCH', 'REPOSITORY_MISMATCH', criteria, evidence);
  }
  if (normalizeBranch(evidence.baseBranch) !== normalizeBranch(criteria.baseBranch)) {
    return result('MISMATCH', 'BASE_BRANCH_MISMATCH', criteria, evidence);
  }
  const deliverySha = normalizeSha(evidence.deliverySha);
  if (!/^[0-9a-f]{40}$/.test(deliverySha)) {
    return result('MISMATCH', 'DELIVERY_SHA_MISSING', criteria, evidence);
  }
  if (normalizeSubmitter(evidence.submitter) !== normalizeSubmitter(criteria.expectedSubmitter)) {
    return result('MISMATCH', 'SUBMITTER_MISMATCH', criteria, evidence);
  }
  if (criteria.requireMerged && !evidence.merged) {
    return result('MISMATCH', 'MERGE_REQUIRED', criteria, evidence);
  }

  const matchingChecks = evidence.checks.filter(
    (check) => check.name.trim() === criteria.requiredCheckName.trim(),
  );
  if (matchingChecks.length === 0) {
    return result('MISMATCH', 'CHECK_MISSING', criteria, evidence);
  }
  const check = matchingChecks[0];
  if (check!.sha.trim().toLowerCase() !== deliverySha) {
    return result('MISMATCH', 'CHECK_SHA_MISMATCH', criteria, evidence);
  }
  if (check!.appId !== criteria.trustedAppId) {
    return result('MISMATCH', 'CHECK_APP_MISMATCH', criteria, evidence);
  }
  if (check!.conclusion?.trim().toLowerCase() !== 'success') {
    return result('MISMATCH', 'CHECK_NOT_SUCCESSFUL', criteria, evidence);
  }

  return result('PASS', 'DELIVERY_ACCEPTED', criteria, evidence);
}
