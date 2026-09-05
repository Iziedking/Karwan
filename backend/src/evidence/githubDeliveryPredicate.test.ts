import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGitHubDelivery, type GitHubDeliveryCriteria, type GitHubDeliveryEvidence } from './githubDeliveryPredicate.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const criteria: GitHubDeliveryCriteria = {
  repositoryId: 123456,
  baseBranch: 'main',
  expectedSubmitter: 'seller-account',
  requireMerged: true,
  requiredCheckName: 'Karwan delivery gate',
  trustedAppId: 4242,
};

const evidence: GitHubDeliveryEvidence = {
  repositoryId: 123456,
  baseBranch: 'refs/heads/main',
  deliverySha: SHA,
  submitter: 'Seller-Account',
  merged: true,
  checks: [{ name: 'Karwan delivery gate', appId: 4242, conclusion: 'success', sha: SHA }],
  sourceFetchedAtUnix: 1_757_000_000,
};

test('accepted delivery binds repository, submitter, merge, SHA, and trusted app', () => {
  const result = evaluateGitHubDelivery(criteria, evidence);
  assert.equal(result.decisionCode, 'PASS');
  assert.equal(result.reasonCode, 'DELIVERY_ACCEPTED');
  assert.equal(result.deliverySha, SHA);
  assert.match(result.evidenceDigest, /^[0-9a-f]{64}$/);
});

test('changed delivery SHA invalidates the prior evidence result', () => {
  const result = evaluateGitHubDelivery(criteria, {
    ...evidence,
    deliverySha: OTHER_SHA,
  });
  assert.equal(result.decisionCode, 'MISMATCH');
  assert.equal(result.reasonCode, 'CHECK_SHA_MISMATCH');
});

test('check names alone cannot spoof a trusted GitHub app', () => {
  const result = evaluateGitHubDelivery(criteria, {
    ...evidence,
    checks: [{ name: 'Karwan delivery gate', appId: 9999, conclusion: 'success', sha: SHA }],
  });
  assert.equal(result.decisionCode, 'MISMATCH');
  assert.equal(result.reasonCode, 'CHECK_APP_MISMATCH');
});

test('source outage is unavailable rather than a failed trust result', () => {
  const result = evaluateGitHubDelivery(criteria, { ...evidence, checks: null });
  assert.equal(result.decisionCode, 'UNAVAILABLE');
  assert.equal(result.reasonCode, 'SOURCE_UNAVAILABLE');
});

