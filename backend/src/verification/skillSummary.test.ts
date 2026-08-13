import test from 'node:test';
import assert from 'node:assert/strict';
import { summariseSkills, type SkillRecord } from './skillSummary.js';
import type { PolicyFlags } from './types.js';

const NOW = 1_700_000_000_000;

const enforced: PolicyFlags = {
  skillVerificationEnforced: true,
  businessVerificationEnforced: true,
  verifiedReputationEnforced: true,
  verifiedAgentMatchingEnforced: true,
  unverifiedBusinessPerksEnforced: true,
};
const relaxed: PolicyFlags = {
  skillVerificationEnforced: false,
  businessVerificationEnforced: false,
  verifiedReputationEnforced: false,
  verifiedAgentMatchingEnforced: false,
  unverifiedBusinessPerksEnforced: false,
};

function record(over: Partial<SkillRecord> = {}): SkillRecord {
  return {
    skillId: 'welding',
    status: 'verified',
    issuer: 'City & Guilds',
    evidenceType: 'certificate',
    commitment: '0xdeadbeef',
    verifiedAt: NOW - 1000,
    ...over,
  };
}

const summarise = (
  declaredSkills: string[],
  verifications: SkillRecord[] | undefined,
  flags = enforced,
) =>
  summariseSkills(
    { accountKind: 'individual', declaredSkills, verifications },
    flags,
    'v1',
    NOW,
  );

test('a declared skill with no attestation is not verified', () => {
  // The whole point of the tool. The profile lists what the user typed; calling
  // that verified would upgrade a claim into an attestation by accident.
  const s = summarise(['welding'], []);
  assert.equal(s.skills[0]!.status, 'unverified');
  assert.equal(s.verifiedCount, 0);
  assert.equal(s.skills[0]!.issuer, null);
});

test('a verified skill carries its issuer', () => {
  // Never merged into one badge: a counterparty judging the claim has to know
  // who stood behind it.
  const s = summarise(['welding'], [record()]);
  assert.equal(s.skills[0]!.status, 'verified');
  assert.equal(s.skills[0]!.issuer, 'City & Guilds');
  assert.equal(s.verifiedCount, 1);
});

test('a lapsed verification reads as expired, not verified', () => {
  // The stored record still says `verified`. Only the policy knows the date has
  // passed, and two surfaces disagreeing about that is worse than either answer.
  const s = summarise(['welding'], [record({ expiresAt: NOW - 1 })]);
  assert.equal(s.skills[0]!.status, 'expired');
  assert.equal(s.verifiedCount, 0);
  assert.match(s.skills[0]!.reason!, /lapsed/);
});

test('the zk commitment never reaches the summary', () => {
  // It is a hash. It means nothing to a user and internals do not belong in an
  // answer the assistant will read out.
  const s = summarise(['welding'], [record()]);
  assert.equal(JSON.stringify(s).includes('0xdeadbeef'), false);
});

test('matching skill to attestation ignores case', () => {
  const s = summarise(['Welding'], [record({ skillId: 'welding' })]);
  assert.equal(s.skills[0]!.status, 'verified');
});

test('verification for a skill they no longer list is surfaced', () => {
  // Still real, still theirs, simply unused. Adding it back is one edit.
  const s = summarise(['plumbing'], [record({ skillId: 'welding' })]);
  assert.deepEqual(s.unlistedVerified, ['welding']);
  assert.equal(s.skills[0]!.status, 'unverified');
});

test('an unverified account is told what is gated, and that direct deals are not', () => {
  const s = summarise(['welding'], []);
  assert.equal(s.eligibility.agentMatching, false);
  assert.equal(s.eligibility.reputationEligible, false);
  // The one thing that must never be gated. A seller who cannot be matched can
  // still be paid.
  assert.equal(s.eligibility.directDeals, true);
  assert.deepEqual(s.eligibility.reasons, ['skill-verification-required']);
});

test('one verified skill unlocks the account', () => {
  const s = summarise(['welding', 'plumbing'], [record()]);
  assert.equal(s.eligibility.agentMatching, true);
  assert.deepEqual(s.eligibility.reasons, []);
});

test('nothing is gated when the policy is not enforcing', () => {
  const s = summarise(['welding'], [], relaxed);
  assert.equal(s.eligibility.agentMatching, true);
  assert.deepEqual(s.eligibility.reasons, []);
});

test('a verified business is not blocked by having no skill attestations', () => {
  // Business eligibility turns on the BUSINESS record. Reading skills for it
  // would report a fully verified company as unverified.
  const s = summariseSkills(
    {
      accountKind: 'business',
      declaredSkills: ['fabrication'],
      verifications: [],
      businessVerification: { status: 'verified', verifiedAt: NOW - 1000 },
    },
    enforced,
    'v1',
    NOW,
  );
  assert.equal(s.eligibility.agentMatching, true);
  assert.equal(s.eligibility.businessPerks, true);
});
