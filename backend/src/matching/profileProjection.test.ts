import assert from 'node:assert/strict';
import test from 'node:test';
import {
  profileCandidateVersion,
  profileMandateVersion,
  profileSellerMandateVersion,
  projectProfileSkillEvidence,
} from './profileProjection.js';

const mandate = {
  jobId: 'JOB-1',
  buyer: '0xBuyer',
  budgetUsdc: '100.000000',
  deadlineUnix: 1_800_000_000,
  termsHash: 'terms-v1',
  negotiationMaxIncreasePct: 5,
  keywords: ['Copywriting', 'brand', 'copywriting'],
  briefText: 'Write a launch brief',
  trustedMatch: true,
  tradeLane: 'service' as const,
  sourcingSector: 'Textiles',
  sourcingRegion: 'West Africa',
};

const candidate = {
  candidateId: '0xSeller',
  sellerAgentAddress: '0xSeller',
  sellerOwnerAddress: '0xOwner',
  priceUsdc: '90.000000',
  deadlineUnix: 1_799_000_000,
  lane: 'service' as const,
  keywords: ['Brand', 'copywriting', 'brand'],
  declaredSkills: ['API integration'],
  skillEvidence: [{ skillId: 'api integration', status: 'verified', issuer: 'Issuer-A', expiresAtUnix: 1_900_000_000 }],
  tier: 'established' as const,
};

test('profile mandate versions are deterministic and normalize unordered terms', () => {
  const first = profileMandateVersion(mandate);
  const second = profileMandateVersion({ ...mandate, buyer: '  0xbUYER ', keywords: ['brand', 'COPYWRITING'] });
  assert.equal(first, second);
  assert.ok(Number.isSafeInteger(first));
  assert.ok(first > 0);
});

test('profile mandate versions change when immutable mandate content changes', () => {
  assert.notEqual(profileMandateVersion(mandate), profileMandateVersion({ ...mandate, budgetUsdc: '101.000000' }));
  assert.notEqual(profileMandateVersion(mandate), profileMandateVersion({ ...mandate, termsHash: 'terms-v2' }));
});

test('profile candidate versions are deterministic and normalize unordered terms', () => {
  const first = profileCandidateVersion(candidate);
  const second = profileCandidateVersion({ ...candidate, candidateId: '  0xSELLER ', keywords: ['COPYWRITING', 'brand'] });
  assert.equal(first, second);
  assert.ok(Number.isSafeInteger(first));
  assert.ok(first > 0);
});

test('profile candidate versions change when immutable candidate content changes', () => {
  assert.notEqual(profileCandidateVersion(candidate), profileCandidateVersion({ ...candidate, priceUsdc: '91.000000' }));
  assert.notEqual(profileCandidateVersion(candidate), profileCandidateVersion({ ...candidate, deadlineUnix: 1_799_000_001 }));
  assert.notEqual(profileCandidateVersion(candidate), profileCandidateVersion({ ...candidate, declaredSkills: ['different skill'] }));
  assert.notEqual(profileCandidateVersion(candidate), profileCandidateVersion({ ...candidate, skillEvidence: [{ skillId: 'api integration', status: 'revoked', issuer: 'Issuer-A' }] }));
  assert.notEqual(profileCandidateVersion(candidate), profileCandidateVersion({
    ...candidate,
    transactionEvidence: [{
      source: 'karwan_onchain', completed: 1, disputed: 0, failed: 0,
      verified: true, evidenceId: 'reputation:1',
    }],
  }));
});

test('profile skill projection preserves attestation state and converts timestamps without inventing evidence ids', () => {
  assert.deepEqual(projectProfileSkillEvidence([
    { skillId: 'API integration', status: 'verified', issuer: 'Issuer-A', expiresAt: 1_900_000_000_000 },
    { skillId: 'Writing', status: 'pending', issuer: 'Issuer-B' },
    { skillId: 'Design', status: 'revoked', issuer: 'Issuer-C' },
  ]), [
    { skillId: 'API integration', status: 'verified', issuer: 'Issuer-A', expiresAtUnix: 1_900_000_000 },
    { skillId: 'Writing', status: 'declared', issuer: 'Issuer-B' },
    { skillId: 'Design', status: 'revoked', issuer: 'Issuer-C' },
  ]);
  assert.equal('evidenceId' in projectProfileSkillEvidence([{ skillId: 'x', status: 'verified', issuer: 'i' }])[0]!, false);
});

test('seller mandate versions are deterministic and change when seller constraints change', () => {
  const input = {
    dealRoomId: 'JOB-1',
    sellerAgentAddress: '0xSeller',
    sellerOwnerAddress: '0xOwner',
    minimumPriceUsdc: '90.000000',
    maxDeadlineUnix: 1_800_000_000,
    lane: 'service' as const,
    keywords: ['API', 'api'],
    declaredSkills: ['API integration'],
    tier: 'established' as const,
  };
  assert.equal(profileSellerMandateVersion(input), profileSellerMandateVersion({ ...input, keywords: ['api'] }));
  assert.notEqual(profileSellerMandateVersion(input), profileSellerMandateVersion({ ...input, minimumPriceUsdc: '91.000000' }));
  assert.notEqual(profileSellerMandateVersion(input), profileSellerMandateVersion({ ...input, sellerAgentAddress: '0xOtherSeller' }));
});
