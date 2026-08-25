import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildListingMatchingProjection,
  buildListingMatchingShadowObservation,
  listingCandidateVersion,
  listingMandateVersion,
} from './listingProjection.js';

const listing = {
  id: 'lst_api',
  sellerUser: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  sellerAgent: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  title: 'API integration',
  description: 'Build and document an API integration.',
  askingPriceUsdc: 90,
  negotiationMaxDecreasePct: 10,
  postedAt: 1_000_000,
  expiresAt: 2_000_000,
  tradeLane: 'service' as const,
  partyKind: 'person' as const,
};

const seller = {
  address: listing.sellerAgent,
  userAddress: listing.sellerUser,
  skills: ['backend'],
  keywords: ['api', 'backend'],
  skillVerifications: [{ skillId: 'backend', status: 'verified' as const, issuer: 'issuer-a', expiresAt: 1_900_000_000_000 }],
};

const job = {
  jobId: 'job_api',
  buyer: '0xcccccccccccccccccccccccccccccccccccccc',
  ownerAddress: '0xdddddddddddddddddddddddddddddddddddddd',
  budgetUsdc: '100',
  deadlineUnix: 1_500_000,
  termsHash: 'terms-1',
  briefText: 'Need an API integration',
  keywords: ['api'],
  negotiationMaxIncreasePct: 5,
  tradeLane: 'service' as const,
};

test('listing projection preserves the legacy offer while compiling immutable v2 snapshots', () => {
  const { mandate, candidate } = buildListingMatchingProjection(listing, seller, job);
  assert.equal(mandate.mandateId, job.jobId);
  assert.equal(mandate.ownerAddress, job.ownerAddress);
  assert.equal(mandate.agentAddress, job.buyer);
  assert.equal(mandate.maxBudgetUsdc, '105');
  assert.deepEqual(mandate.requiredKeywords, ['api']);
  assert.equal(mandate.minimumReliability, 60);
  assert.equal(mandate.reliabilityPolicyVersion, 'matching-reliability-v1');
  assert.equal(candidate.kind, 'listing');
  assert.equal(candidate.candidateId, listing.id);
  assert.equal(candidate.priceUsdc, '90');
  assert.equal(candidate.deadlineUnix, job.deadlineUnix);
  assert.equal(candidate.expiresAtUnix, 2_000);
  assert.deepEqual(candidate.declaredSkills, ['backend']);
  assert.deepEqual(candidate.keywords, ['api', 'backend']);
  assert.deepEqual(candidate.skillEvidence, [{ skillId: 'backend', status: 'verified', issuer: 'issuer-a', expiresAtUnix: 1_900_000_000 }]);
});

test('mandate and candidate versions are stable for the same input and change when content changes', () => {
  const firstMandate = listingMandateVersion(job);
  assert.equal(firstMandate, listingMandateVersion({ ...job }));
  assert.notEqual(firstMandate, listingMandateVersion({ ...job, budgetUsdc: '101' }));
  assert.notEqual(firstMandate, listingMandateVersion({ ...job, buyer: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }));
  assert.notEqual(firstMandate, listingMandateVersion({ ...job, ownerAddress: '0xffffffffffffffffffffffffffffffffffffffff' }));
  assert.equal(firstMandate, listingMandateVersion({ ...job, keywords: ['API', 'api'] }));
  assert.notEqual(
    listingMandateVersion({ ...job, jobId: 'a|b', termsHash: 'c' }),
    listingMandateVersion({ ...job, jobId: 'a', termsHash: 'b|c' }),
  );

  const firstCandidate = listingCandidateVersion(listing, seller);
  assert.equal(firstCandidate, listingCandidateVersion({ ...listing }, seller));
  assert.notEqual(firstCandidate, listingCandidateVersion({ ...listing, askingPriceUsdc: 91 }, seller));
  assert.notEqual(firstCandidate, listingCandidateVersion(listing, {
    ...seller,
    skillVerifications: [{ skillId: 'backend', status: 'revoked', issuer: 'issuer-a' }],
  }));
});

test('finance projections require a verified-business candidate without changing the source lane', () => {
  const { mandate, candidate } = buildListingMatchingProjection(
    { ...listing, tradeLane: 'finance', partyKind: 'business' },
    seller,
    { ...job, tradeLane: 'finance' },
  );
  assert.equal(mandate.lane, 'finance');
  assert.equal(mandate.requiresVerifiedBusiness, true);
  assert.equal(mandate.minimumReliability, 80);
  assert.equal(candidate.lane, 'finance');
  assert.equal(candidate.partyKind, 'business');
});

test('listing shadow observations identify the legacy result without granting authority', () => {
  const matched = buildListingMatchingShadowObservation(listing, seller, job, true, 1_200, {
    legacyLatencyMs: 8,
    legacyPaidCallCount: 0,
    shadowPaidCallCount: 0,
  });
  assert.equal(matched.source, 'listing-brief');
  assert.deepEqual(matched.legacyCandidateIds, [listing.id]);
  assert.equal(matched.candidates.length, 1);
  assert.equal(matched.nowUnix, 1_200);
  assert.deepEqual(matched.telemetry, {
    legacyLatencyMs: 8,
    legacyPaidCallCount: 0,
    shadowPaidCallCount: 0,
  });
  const skipped = buildListingMatchingShadowObservation(listing, seller, job, false, 1_200);
  assert.deepEqual(skipped.legacyCandidateIds, []);
  assert.notEqual(matched.observationKey, skipped.observationKey);
});
