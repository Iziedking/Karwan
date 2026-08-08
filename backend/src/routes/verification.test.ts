import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import type { PolicyFlags } from '../verification/types.js';
import { createVerificationRoutes } from './verification.js';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const enforced: PolicyFlags = { skillVerificationEnforced: true, businessVerificationEnforced: true, verifiedReputationEnforced: true, verifiedAgentMatchingEnforced: true, unverifiedBusinessPerksEnforced: true };

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { address: ADDRESS, role: 'both', displayName: 'Test', createdAt: 1, updatedAt: 1, ...overrides };
}

function routes(value: UserProfile | null) {
  return createVerificationRoutes({ getProfile: async () => value, getPolicyFlags: () => enforced, getPolicyVersion: () => 'preview-v1', now: () => 500 });
}

test('eligibility rejects an invalid address', async () => {
  const response = await routes(null).request('/eligibility/not-an-address');
  assert.equal(response.status, 400);
});

test('eligibility returns 404 for a missing profile', async () => {
  const response = await routes(null).request(`/eligibility/${ADDRESS}`);
  assert.equal(response.status, 404);
});

test('unverified business keeps direct deals but loses matching', async () => {
  const response = await routes(profile({ accountKind: 'business' })).request(`/eligibility/${ADDRESS}`);
  assert.equal(response.status, 200);
  const body = await response.json() as { eligibility: { directDeals: boolean; agentMatching: boolean; reasons: string[] } };
  assert.equal(body.eligibility.directDeals, true);
  assert.equal(body.eligibility.agentMatching, false);
  assert.deepEqual(body.eligibility.reasons, ['business-verification-required']);
});

test('verified individual reputation starts at verifiedAt', async () => {
  const response = await routes(profile({ accountKind: 'person', skillVerifications: [{ skillId: 'typescript', status: 'verified', issuer: 'issuer', evidenceType: 'attestation', commitment: '0xabc', verifiedAt: 123 }] })).request(`/eligibility/${ADDRESS}`);
  assert.equal(response.status, 200);
  const body = await response.json() as { eligibility: { reputationEligible: boolean; reputationEligibleFrom?: number } };
  assert.equal(body.eligibility.reputationEligible, true);
  assert.equal(body.eligibility.reputationEligibleFrom, 123);
});