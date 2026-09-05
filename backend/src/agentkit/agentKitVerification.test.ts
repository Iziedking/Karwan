import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENTKIT_DOMAIN,
  createAgentKitVerifier,
  deriveHumanKeyDigest,
  unavailableAgentKitVerifier,
} from './agentKitVerification.js';

const AGENT = '0x1111111111111111111111111111111111111111';
const SECRET = '01234567890123456789012345678901';

function request(nonce = 'nonce-1') {
  return {
    agentAddress: AGENT,
    domain: AGENTKIT_DOMAIN,
    nonce,
    issuedAt: 1_000,
    expiresAt: 2_000,
    signature: '0xsandbox-proof',
    proof: { mode: 'fixture' },
  };
}

test('provider verification derives an opaque app-scoped human key', async () => {
  const verifier = createAgentKitVerifier({
    humanKeySecret: SECRET,
    now: () => 1_500,
    provider: {
      async verify() {
        return {
          status: 'verified' as const,
          result: { verified: true, agentAddress: AGENT, humanSubject: 'human-fixture-1', checkedAt: 1_500, expiresAt: 1_900 },
        };
      },
    },
  });
  const result = await verifier.verify(request());
  assert.equal(result.status, 'verified');
  if (result.status !== 'verified') return;
  assert.equal(result.humanKeyDigest, deriveHumanKeyDigest(SECRET, 'human-fixture-1'));
  assert.equal(result.humanKeyDigest.includes('human-fixture'), false);
});

test('malformed, expired, and provider-unavailable proofs never become verified', async () => {
  const verifier = createAgentKitVerifier({
    humanKeySecret: SECRET,
    now: () => 2_100,
    provider: { async verify() { throw new Error('must not be called'); } },
  });
  const expired = await verifier.verify(request());
  assert.equal(expired.status, 'rejected');
  const unavailable = await unavailableAgentKitVerifier().verify(request('nonce-2'));
  assert.equal(unavailable.status, 'unavailable');
});

test('provider cannot bind a proof to a different agent address', async () => {
  const verifier = createAgentKitVerifier({
    humanKeySecret: SECRET,
    now: () => 1_500,
    provider: {
      async verify() {
        return {
          status: 'verified' as const,
          result: { verified: true, agentAddress: '0x2222222222222222222222222222222222222222', humanSubject: 'human-fixture-1', checkedAt: 1_500, expiresAt: 1_900 },
        };
      },
    },
  });
  const result = await verifier.verify(request('nonce-3'));
  assert.equal(result.status, 'rejected');
});

test('an unverified provider result is rejected without reading a missing message', async () => {
  const verifier = createAgentKitVerifier({
    humanKeySecret: SECRET,
    now: () => 1_500,
    provider: {
      async verify() {
        return {
          status: 'verified' as const,
          result: { verified: false, agentAddress: AGENT, humanSubject: 'human-fixture-1', checkedAt: 1_500, expiresAt: 1_900 },
        };
      },
    },
  });
  const result = await verifier.verify(request('nonce-4'));
  assert.deepEqual(result, { status: 'rejected', code: 'PROOF_REJECTED', message: 'agent proof rejected' });
});
