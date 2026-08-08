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
import { businessVerificationState, skillVerificationState } from './policy.js';

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
