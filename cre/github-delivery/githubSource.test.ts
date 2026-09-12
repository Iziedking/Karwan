import { describe, expect, test } from 'bun:test';
import type { TeeRuntime } from '@chainlink/cre-sdk';
import { loadGitHubEvidence, type ConfidentialCriteria } from './githubSource.js';
import { evaluateGitHubDelivery } from '../../backend/src/evidence/githubDeliveryPredicate.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MERGE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOKEN = 'test-token-never-use-live';

const criteria: ConfidentialCriteria = {
  owner: 'karwan-demo',
  repository: 'delivery-repo',
  repositoryId: 123456,
  baseBranch: 'main',
  expectedSubmitter: 'seller-account',
  requireMerged: true,
  requiredCheckName: 'Karwan delivery gate',
  trustedAppId: 4242,
  shaMode: 'head',
};

type StubResponse = { statusCode: number; body: unknown };

function makeRuntime(responses: StubResponse[]) {
  const requests: Array<{ url?: string; multiHeaders?: Record<string, { values?: string[] }> }> = [];
  const runtime = {
    config: {},
    now: () => new Date(1_757_000_000_000),
    log: () => undefined,
    getSecret: () => ({ result: () => ({ value: '' }) }),
    usingTheDons: () => { throw new Error('not used'); },
    reportFromDon: () => { throw new Error('not used'); },
    callCapability: ({ payload }: { payload: typeof requests[number] }) => {
      requests.push(payload);
      const next = responses.shift();
      if (!next) throw new Error('unexpected request');
      return {
        result: () => ({
          statusCode: next.statusCode,
          body: new TextEncoder().encode(typeof next.body === 'string' ? next.body : JSON.stringify(next.body)),
        }),
      };
    },
  };
  return { runtime: runtime as unknown as TeeRuntime<unknown>, requests };
}

function pull(overrides: Record<string, unknown> = {}) {
  return {
    base: { ref: 'main', repo: { id: 123456 } },
    head: { sha: SHA },
    merge_commit_sha: MERGE_SHA,
    merged: true,
    user: { login: 'seller-account' },
    ...overrides,
  };
}

function checks(sha = SHA) {
  return {
    total_count: 1,
    check_runs: [{
      name: 'Karwan delivery gate',
      head_sha: sha,
      conclusion: 'success',
      app: { id: 4242 },
    }],
  };
}

describe('loadGitHubEvidence', () => {
  test('a submitted PR from another repository cannot verify the policy repository PR with the same number', () => {
    const { runtime, requests } = makeRuntime([
      { statusCode: 200, body: pull({ base: { ref: 'main', repo: { id: 999999 } } }) },
      { statusCode: 200, body: checks() },
    ]);
    const result = loadGitHubEvidence(runtime, criteria, TOKEN, 42, SHA, { owner: 'another-owner', repository: 'another-repo' });
    expect(requests[0]?.url).toBe('https://api.github.com/repos/another-owner/another-repo/pulls/42');
    expect(evaluateGitHubDelivery(result.criteria, result.evidence).reasonCode).toBe('REPOSITORY_MISMATCH');
  });
  test('uses only the fixed GitHub API root and binds the chosen head SHA', () => {
    const { runtime, requests } = makeRuntime([
      { statusCode: 200, body: pull() },
      { statusCode: 200, body: checks() },
    ]);
    const result = loadGitHubEvidence(runtime, criteria, TOKEN, 42, SHA);

    expect(result.evidence.deliverySha).toBe(SHA);
    expect(result.evidence.submittedSha).toBe(SHA);
    expect(result.evidence.sourceFetchedAtUnix).toBe(1_757_000_000);
    expect(requests.map((request) => request.url)).toEqual([
      'https://api.github.com/repos/karwan-demo/delivery-repo/pulls/42',
      `https://api.github.com/repos/karwan-demo/delivery-repo/commits/${SHA}/check-runs?per_page=100`,
    ]);
    expect(requests[0]?.multiHeaders?.Authorization?.values).toEqual([`Bearer ${TOKEN}`]);
  });

  test('defines merge mode as the immutable merge commit SHA', () => {
    const { runtime } = makeRuntime([
      { statusCode: 200, body: pull() },
      { statusCode: 200, body: checks(MERGE_SHA) },
    ]);
    const result = loadGitHubEvidence(
      runtime,
      { ...criteria, shaMode: 'merge' },
      TOKEN,
      42,
      MERGE_SHA,
    );
    expect(result.evidence.deliverySha).toBe(MERGE_SHA);
  });

  test('maps denied, rate-limited, and missing source responses to unavailable evidence', () => {
    for (const statusCode of [403, 404, 429]) {
      const { runtime } = makeRuntime([{ statusCode, body: { message: 'hidden' } }]);
      expect(loadGitHubEvidence(runtime, criteria, TOKEN, 42, SHA).evidence.checks).toBeNull();
    }
  });

  test('rejects truncated pagination instead of treating missing checks as failure', () => {
    const { runtime } = makeRuntime([
      { statusCode: 200, body: pull() },
      { statusCode: 200, body: { ...checks(), total_count: 2 } },
    ]);
    expect(loadGitHubEvidence(runtime, criteria, TOKEN, 42, SHA).evidence.checks).toBeNull();
  });

  test('rejects oversized response bodies inside the confidential source boundary', () => {
    const { runtime } = makeRuntime([{ statusCode: 200, body: 'x'.repeat(512_001) }]);
    expect(loadGitHubEvidence(runtime, criteria, TOKEN, 42, SHA).evidence.checks).toBeNull();
  });
});
