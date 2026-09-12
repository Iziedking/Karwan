import { cre, ok, text, type TeeRuntime } from '@chainlink/cre-sdk';
import { z } from 'zod';
import type {
  GitHubDeliveryCriteria,
  GitHubDeliveryEvidence,
} from '../../backend/src/evidence/githubDeliveryPredicate.js';

const MAX_GITHUB_BODY_BYTES = 512_000;
const GITHUB_API_ROOT = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const gitShaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/);

export const confidentialCriteriaSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  repository: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
  repositoryId: z.number().int().positive().safe(),
  baseBranch: z.string().min(1).max(255),
  expectedSubmitter: z.string().min(1).max(39),
  requireMerged: z.boolean(),
  requiredCheckName: z.string().min(1).max(255),
  trustedAppId: z.number().int().positive().safe(),
  shaMode: z.enum(['head', 'merge']),
}).strict();

export type ConfidentialCriteria = z.infer<typeof confidentialCriteriaSchema>;

const pullSchema = z.object({
  base: z.object({
    ref: z.string(),
    repo: z.object({ id: z.number().int().safe() }),
  }),
  head: z.object({ sha: gitShaSchema }),
  merge_commit_sha: gitShaSchema.nullable(),
  merged: z.boolean(),
  user: z.object({ login: z.string() }),
});

const checksSchema = z.object({
  total_count: z.number().int().nonnegative(),
  check_runs: z.array(z.object({
    name: z.string(),
    head_sha: gitShaSchema,
    conclusion: z.string().nullable(),
    app: z.object({ id: z.number().int().safe() }).nullable(),
  })).max(100),
});

export class GitHubSourceUnavailableError extends Error {
  constructor() {
    super('GITHUB_SOURCE_UNAVAILABLE');
    this.name = 'GitHubSourceUnavailableError';
  }
}

function criteriaForPredicate(criteria: ConfidentialCriteria): GitHubDeliveryCriteria {
  return {
    repositoryId: criteria.repositoryId,
    baseBranch: criteria.baseBranch,
    expectedSubmitter: criteria.expectedSubmitter,
    requireMerged: criteria.requireMerged,
    requiredCheckName: criteria.requiredCheckName,
    trustedAppId: criteria.trustedAppId,
    shaMode: criteria.shaMode,
  };
}

function fetchJson(runtime: TeeRuntime<unknown>, url: string, token: string): unknown {
  const response = new cre.capabilities.HTTPClient().sendRequest(runtime, {
    url,
    method: 'GET',
    multiHeaders: {
      Accept: { values: ['application/vnd.github+json'] },
      Authorization: { values: [`Bearer ${token}`] },
      'User-Agent': { values: ['karwan-cre-github-delivery'] },
      'X-GitHub-Api-Version': { values: [GITHUB_API_VERSION] },
    },
  }).result();

  if (!ok(response) || [403, 404, 429].includes(response.statusCode)) {
    throw new GitHubSourceUnavailableError();
  }
  const body = text(response);
  if (new TextEncoder().encode(body).byteLength > MAX_GITHUB_BODY_BYTES) {
    throw new GitHubSourceUnavailableError();
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new GitHubSourceUnavailableError();
  }
}

export function loadGitHubEvidence(
  runtime: TeeRuntime<unknown>,
  confidentialCriteria: ConfidentialCriteria,
  token: string,
  pullNumber: number,
  submittedSha: string,
  submittedRepository?: Pick<ConfidentialCriteria, 'owner' | 'repository'>,
): { criteria: GitHubDeliveryCriteria; evidence: GitHubDeliveryEvidence } {
  const criteria = criteriaForPredicate(confidentialCriteria);
  // Automatic submissions carry the actual repository. Never substitute the
  // policy repository merely because both repositories have a PR numbered 1.
  const source = submittedRepository ?? confidentialCriteria;
  const repoPath = `${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}`;

  try {
    const pull = pullSchema.parse(fetchJson(
      runtime,
      `${GITHUB_API_ROOT}/repos/${repoPath}/pulls/${pullNumber}`,
      token,
    ));
    const deliverySha = criteria.shaMode === 'head' ? pull.head.sha : pull.merge_commit_sha;
    if (deliverySha === null) throw new GitHubSourceUnavailableError();

    const checks = checksSchema.parse(fetchJson(
      runtime,
      `${GITHUB_API_ROOT}/repos/${repoPath}/commits/${encodeURIComponent(deliverySha)}/check-runs?per_page=100`,
      token,
    ));
    if (checks.total_count !== checks.check_runs.length) {
      throw new GitHubSourceUnavailableError();
    }

    return {
      criteria,
      evidence: {
        repositoryId: pull.base.repo.id,
        baseBranch: pull.base.ref,
        deliverySha,
        submittedSha,
        submitter: pull.user.login,
        merged: pull.merged,
        checks: checks.check_runs.map((check) => ({
          name: check.name,
          appId: check.app?.id ?? null,
          conclusion: check.conclusion,
          sha: check.head_sha,
        })),
        sourceFetchedAtUnix: Math.floor(runtime.now().getTime() / 1_000),
      },
    };
  } catch (error) {
    if (!(error instanceof GitHubSourceUnavailableError) && !(error instanceof z.ZodError)) {
      throw error;
    }
    return {
      criteria,
      evidence: {
        repositoryId: null,
        baseBranch: null,
        deliverySha: null,
        submittedSha,
        submitter: null,
        merged: null,
        checks: null,
        sourceFetchedAtUnix: null,
      },
    };
  }
}

export const githubSourceLimits = {
  apiRoot: GITHUB_API_ROOT,
  maxBodyBytes: MAX_GITHUB_BODY_BYTES,
  maxCheckRuns: 100,
} as const;
