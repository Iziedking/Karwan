import type {
  GitHubDeliveryCriteria,
  GitHubDeliveryEvidence,
} from '../../backend/src/evidence/githubDeliveryPredicate.js';

export type FixtureScenario = 'accepted' | 'mismatched' | 'corrected' | 'unavailable';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export function loadFixtureEvidence(
  scenario: FixtureScenario,
  sourceFetchedAtUnix: number,
  submittedSha: string,
): { criteria: GitHubDeliveryCriteria; evidence: GitHubDeliveryEvidence } {
  const criteria: GitHubDeliveryCriteria = {
    repositoryId: 123456,
    baseBranch: 'main',
    expectedSubmitter: 'seller-account',
    requireMerged: true,
    requiredCheckName: 'Karwan delivery gate',
    trustedAppId: 4242,
    shaMode: 'head',
  };
  const deliverySha = scenario === 'corrected' ? SHA_B : SHA_A;
  const evidence: GitHubDeliveryEvidence = {
    repositoryId: criteria.repositoryId,
    baseBranch: 'refs/heads/main',
    deliverySha,
    submittedSha,
    submitter: criteria.expectedSubmitter,
    merged: true,
    checks: [{
      name: criteria.requiredCheckName,
      appId: criteria.trustedAppId,
      conclusion: 'success',
      sha: deliverySha,
    }],
    sourceFetchedAtUnix,
  };
  if (scenario === 'unavailable') {
    evidence.repositoryId = null;
    evidence.baseBranch = null;
    evidence.deliverySha = null;
    evidence.submitter = null;
    evidence.merged = null;
    evidence.checks = null;
    evidence.sourceFetchedAtUnix = null;
  }
  return { criteria, evidence };
}
