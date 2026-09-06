import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAgentKitVerifier,
  deriveHumanKeyDigest,
  unavailableAgentKitVerifier,
} from './agentKitVerification.js';

const AGENT = '0x1111111111111111111111111111111111111111';
const SECRET = '01234567890123456789012345678901';
const RESOURCE = 'https://fixture.karwan.test/api/research/agentkit/verify';

function request(nonce = 'nonce-1') {
  return { header: `${AGENT}:${nonce}`, resourceUri: RESOURCE };
}

function providerResult(agentAddress = AGENT, nonce = 'nonce-1') {
  return {
    verified: true,
    agentAddress,
    humanSubject: 'human-fixture-1',
    checkedAt: 1_500,
    expiresAt: 1_900,
    domain: 'fixture.karwan.test',
    nonce,
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
          result: providerResult(),
        };
      },
    },
  });
  const result = await verifier.verify(request());
  assert.equal(result.status, 'verified');
  if (result.status !== 'verified') return;
  assert.equal(result.humanKeyDigest, deriveHumanKeyDigest(SECRET, 'human-fixture-1'));
  assert.equal(result.humanKeyDigest.includes('human-fixture'), false);
  assert.equal(result.nonce, 'nonce-1');
  assert.equal(result.domain, 'fixture.karwan.test');
});

test('malformed requests and provider outages never become verified', async () => {
  const verifier = createAgentKitVerifier({
    humanKeySecret: SECRET,
    now: () => 1_500,
    provider: { async verify() { throw new Error('provider down'); } },
  });
  const malformed = await verifier.verify({ header: '', resourceUri: 'not a url' });
  assert.equal(malformed.status, 'rejected');
  const providerDown = await verifier.verify(request());
  assert.equal(providerDown.status, 'unavailable');
  const unavailable = await unavailableAgentKitVerifier().verify(request('nonce-2'));
  assert.equal(unavailable.status, 'unavailable');
});

test('short human-key secret fails at boot instead of after a provider lookup', () => {
  assert.throws(
    () => createAgentKitVerifier({
      humanKeySecret: 'too-short',
      provider: { async verify() { throw new Error('must not be called'); } },
    }),
    /identity secret is not configured/,
  );
});

test('provider cannot return a malformed agent address', async () => {
  const verifier = createAgentKitVerifier({
    humanKeySecret: SECRET,
    now: () => 1_500,
    provider: {
      async verify() {
        return {
          status: 'verified' as const,
          result: providerResult('not-an-address'),
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
          result: { ...providerResult(), verified: false },
        };
      },
    },
  });
  const result = await verifier.verify(request('nonce-4'));
  assert.deepEqual(result, { status: 'rejected', code: 'PROOF_REJECTED', message: 'agent proof rejected' });
});
