import assert from 'node:assert/strict';
import test from 'node:test';
import { trustPatch } from './applyDecision.js';
import type { TrustDecision } from './riskEngine.js';

const decision = (over: Partial<TrustDecision>): TrustDecision => ({
  version: 'trust-v1', level: 'clear', verify: {}, stakeRequired: false, delivery: 'plain', reasons: [], decidedAt: 1, ...over,
});

test('a clear decision only records itself', () => {
  assert.deepEqual(trustPatch({}, decision({})), { trust: decision({}) });
});

test('a first-deal seller becomes the World ID subject the accept gate reads', () => {
  const patch = trustPatch({}, decision({ verify: { seller: 'first_deal' } }));
  assert.equal(patch.verificationPolicy, 'high_signal');
  assert.equal(patch.verificationSubject, 'seller');
  assert.deepEqual(patch.highSignalVerification?.seller, { status: 'pending' });
  assert.equal(patch.highSignalVerification?.buyer, undefined);
});

test('adding the buyer keeps a seller who already verified', () => {
  const patch = trustPatch(
    {
      verificationPolicy: 'high_signal',
      verificationSubject: 'seller',
      highSignalVerification: { mode: 'high_signal', subject: 'seller', provider: 'world-id', seller: { status: 'verified', verifiedAt: 5 } },
    },
    decision({ verify: { buyer: 'first_deal' } }),
  );
  assert.equal(patch.verificationSubject, 'both');
  assert.equal(patch.highSignalVerification?.seller?.status, 'verified');
  assert.equal(patch.highSignalVerification?.buyer?.status, 'pending');
});

test('never lowers what the buyer already asked for', () => {
  const patch = trustPatch(
    { verificationPolicy: 'high_signal', verificationSubject: 'both', evidenceRequired: true, requireStake: true, requireStakePct: 80 },
    decision({ stakeRequired: true }),
  );
  assert.equal(patch.verificationSubject, undefined);
  assert.equal(patch.evidenceRequired, undefined);
  assert.equal(patch.requireStakePct, 80);
});

test('GitHub delivery turns the code check on, and lost disputes require stake', () => {
  const patch = trustPatch({}, decision({ delivery: 'github', stakeRequired: true }));
  assert.equal(patch.evidenceRequired, true);
  assert.equal(patch.requireStake, true);
  assert.equal(patch.requireStakePct, 50);
});
