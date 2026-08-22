import assert from 'node:assert/strict';
import test from 'node:test';

import { decideEligibility, policyFlags } from './policy.js';
import type { AccountKind, PolicyFlags, VerificationState } from './types.js';

const allOff: PolicyFlags = {
  skillVerificationEnforced: false,
  businessVerificationEnforced: false,
  verifiedReputationEnforced: false,
  verifiedAgentMatchingEnforced: false,
  unverifiedBusinessPerksEnforced: false,
};

const allOn: PolicyFlags = {
  skillVerificationEnforced: true,
  businessVerificationEnforced: true,
  verifiedReputationEnforced: true,
  verifiedAgentMatchingEnforced: true,
  unverifiedBusinessPerksEnforced: true,
};

const states: VerificationState[] = [
  { status: 'unverified' },
  { status: 'pending', submittedAt: 100 },
  { status: 'verified', verifiedAt: 200 },
  { status: 'rejected', reasonCode: 'bad-evidence', message: 'Try again' },
  { status: 'expired', expiredAt: 300 },
  { status: 'revoked', revokedAt: 400, reasonCode: 'issuer-revoked' },
];

const accountKinds: AccountKind[] = ['individual', 'business'];

test('policy flags expose five explicit booleans', () => {
  assert.deepEqual(policyFlags, allOff);
});

for (const accountKind of accountKinds) {
  for (const verification of states) {
    test(`${accountKind} ${verification.status}: enforcement off preserves testnet access`, () => {
      const decision = decideEligibility({
        accountKind,
        verification,
        flags: allOff,
        policyVersion: 'testnet-open-v1',
      });

      assert.equal(decision.directDeals, true);
      assert.equal(decision.agentMatching, true);
      assert.equal(decision.reputationEligible, true);
      assert.equal(decision.businessPerks, accountKind === 'business');
      assert.deepEqual(decision.reasons, []);
      assert.equal(decision.policyVersion, 'testnet-open-v1');
      assert.equal(
        decision.reputationEligibleFrom,
        verification.status === 'verified' ? verification.verifiedAt : undefined,
      );
    });

    test(`${accountKind} ${verification.status}: enforcement on requires current verification`, () => {
      const decision = decideEligibility({
        accountKind,
        verification,
        flags: allOn,
        policyVersion: 'preview-enforced-v1',
      });
      const verified = verification.status === 'verified';

      assert.equal(decision.directDeals, true);
      assert.equal(decision.agentMatching, verified);
      assert.equal(decision.reputationEligible, verified);
      assert.equal(decision.businessPerks, accountKind === 'business' && verified);
      assert.equal(
        decision.reputationEligibleFrom,
        verified ? verification.verifiedAt : undefined,
      );
      assert.deepEqual(
        decision.reasons,
        verified
          ? []
          : [
              accountKind === 'individual'
                ? 'skill-verification-required'
                : 'business-verification-required',
            ],
      );
    });
  }
}

test('capability flags do not restrict access unless account verification enforcement is active', () => {
  const decision = decideEligibility({
    accountKind: 'individual',
    verification: { status: 'unverified' },
    flags: {
      ...allOn,
      skillVerificationEnforced: false,
    },
    policyVersion: 'test-v1',
  });

  assert.equal(decision.agentMatching, true);
  assert.equal(decision.reputationEligible, true);
  assert.deepEqual(decision.reasons, []);
});
import { businessVerificationState, publicSkillCredentials, skillVerificationState } from './policy.js';

test('stored business submitted status normalizes to pending', () => {
  assert.deepEqual(
    businessVerificationState({ status: 'submitted', submittedAt: 123 }, 999),
    { status: 'pending', submittedAt: 123 },
  );
});

test('stored business verified envelope normalizes to verified', () => {
  assert.deepEqual(
    businessVerificationState({ status: 'verified', verifiedAt: 123, expiresAt: 999 }, 500),
    { status: 'verified', verifiedAt: 123, expiresAt: 999 },
  );
});

test('absent skill verification normalizes to unverified', () => {
  assert.deepEqual(skillVerificationState(undefined, 'typescript', 500), { status: 'unverified' });
});

test('verified evidence expired by time normalizes to expired', () => {
  assert.deepEqual(
    skillVerificationState(
      [{ skillId: 'typescript', status: 'verified', verifiedAt: 100, expiresAt: 200 }],
      'typescript',
      201,
    ),
    { status: 'expired', expiredAt: 200 },
  );
});

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

test('a public credential carries the skill and its date, and nothing else', () => {
  const [credential] = publicSkillCredentials(
    [
      {
        skillId: 'typescript',
        status: 'verified',
        verifiedAt: NOW - DAY,
        issuer: 'karwan',
        evidenceType: 'attestation',
        commitment: '0xdeadbeef',
      } as never,
    ],
    NOW,
  );
  assert.deepEqual(credential, { skillId: 'typescript', verifiedAt: NOW - DAY });
  // The evidence trail must not survive the projection: a commitment is a hash
  // of something the holder submitted privately.
  assert.ok(!('commitment' in (credential as object)));
  assert.ok(!('issuer' in (credential as object)));
  assert.ok(!('evidenceType' in (credential as object)));
});

test('only a currently verified credential is public', () => {
  const records = [
    { skillId: 'pending-one', status: 'pending' as const, submittedAt: NOW },
    { skillId: 'rejected-one', status: 'rejected' as const, reasonCode: 'no-evidence' },
    { skillId: 'revoked-one', status: 'revoked' as const, verifiedAt: NOW - DAY },
    { skillId: 'lapsed', status: 'verified' as const, verifiedAt: NOW - 10 * DAY, expiresAt: NOW - DAY },
    { skillId: 'current', status: 'verified' as const, verifiedAt: NOW - DAY, expiresAt: NOW + DAY },
  ];
  assert.deepEqual(
    publicSkillCredentials(records, NOW).map((c) => c.skillId),
    ['current'],
  );
});

test('an undated verification is not published', () => {
  // A credential with no date cannot be judged, and an undated claim on a
  // public page is worse than no claim.
  assert.deepEqual(publicSkillCredentials([{ skillId: 'x', status: 'verified' }], NOW), []);
});

test('re-verification shows the current credential, not the history', () => {
  const credentials = publicSkillCredentials(
    [
      { skillId: 'solidity', status: 'verified', verifiedAt: NOW - 30 * DAY },
      { skillId: 'solidity', status: 'verified', verifiedAt: NOW - DAY },
    ],
    NOW,
  );
  assert.equal(credentials.length, 1);
  assert.equal(credentials[0]!.verifiedAt, NOW - DAY);
});

test('credentials are newest first', () => {
  const credentials = publicSkillCredentials(
    [
      { skillId: 'older', status: 'verified', verifiedAt: NOW - 5 * DAY },
      { skillId: 'newest', status: 'verified', verifiedAt: NOW - DAY },
      { skillId: 'middle', status: 'verified', verifiedAt: NOW - 3 * DAY },
    ],
    NOW,
  );
  assert.deepEqual(credentials.map((c) => c.skillId), ['newest', 'middle', 'older']);
});

test('nothing verified means nothing published', () => {
  assert.deepEqual(publicSkillCredentials(undefined, NOW), []);
  assert.deepEqual(publicSkillCredentials([], NOW), []);
});

test('one rejected skill does not make the whole account unverified', () => {
  // The bug: the general lookup returned whichever record was written first, so
  // an account holding a rejected skill alongside verified ones reported
  // rejected and lost agent matching and reputation eligibility with it.
  const records = [
    { skillId: 'rejected-one', status: 'rejected' as const, reasonCode: 'no-evidence' },
    { skillId: 'typescript', status: 'verified' as const, verifiedAt: NOW - DAY },
  ];
  assert.equal(skillVerificationState(records, undefined, NOW).status, 'verified');
  // Asking about the rejected skill by name still answers honestly.
  assert.equal(skillVerificationState(records, 'rejected-one', NOW).status, 'rejected');
});

test('an expired credential does not count as verified for the account either', () => {
  const records = [
    { skillId: 'lapsed', status: 'verified' as const, verifiedAt: NOW - 10 * DAY, expiresAt: NOW - DAY },
  ];
  assert.equal(skillVerificationState(records, undefined, NOW).status, 'expired');
});
