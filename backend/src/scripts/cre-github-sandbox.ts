import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateGitHubDelivery, GITHUB_DELIVERY_POLICY_VERSION, type GitHubDeliveryEvidence } from '../evidence/githubDeliveryPredicate.js';

interface DemoDealRecord {
  jobId: string;
  terms: string;
}

function isDemoDealRecord(value: unknown): value is DemoDealRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.jobId === 'string' && typeof record.terms === 'string';
}

function loadDemoDeal(): DemoDealRecord {
  const file = join(process.cwd(), 'data', 'direct-deals.json');
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('DEMO_DEALS_FIXTURE_INVALID');
  const record = Object.values(parsed).find(isDemoDealRecord);
  if (!record) throw new Error('DEMO_DEAL_NOT_FOUND');
  return record;
}

const demoDeal = loadDemoDeal();
const criteria = {
  repositoryId: 123456,
  baseBranch: 'main',
  expectedSubmitter: 'seller-account',
  requireMerged: true,
  requiredCheckName: 'Karwan delivery gate',
  trustedAppId: 4242,
};
const deliverySha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const acceptedEvidence: GitHubDeliveryEvidence = {
  repositoryId: criteria.repositoryId,
  baseBranch: 'refs/heads/main',
  deliverySha,
  submitter: criteria.expectedSubmitter,
  merged: true,
  checks: [{ name: criteria.requiredCheckName, appId: criteria.trustedAppId, conclusion: 'success', sha: deliverySha }],
  sourceFetchedAtUnix: 1_757_000_000,
};

const scenarios = [
  ['correct evidence', acceptedEvidence],
  ['mismatched evidence', { ...acceptedEvidence, deliverySha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }],
  ['unavailable source', { ...acceptedEvidence, checks: null }],
] as const;

const results = scenarios.map(([name, evidence]) => ({
  name,
  result: evaluateGitHubDelivery(criteria, evidence),
}));

console.log(JSON.stringify({
  executionMode: 'simulated',
  runner: 'karwan-cre-github-sandbox',
  confidentialRuntime: 'unavailable-locally',
  chainWrite: 'not-broadcast',
  receiverDeployment: 'not-configured',
  provider: 'github-fixture-not-live',
  policyVersion: GITHUB_DELIVERY_POLICY_VERSION,
  boundDemoDealId: demoDeal.jobId,
  termsVersion: 1,
  termsSource: 'current persisted demo-deal terms; version is local fixture metadata',
  scenarios: results,
  claimBoundary: 'This proves deterministic predicate behavior only. It does not prove a CRE TEE, GitHub API freshness, receiver deployment, or an Arc receipt.',
}, null, 2));

