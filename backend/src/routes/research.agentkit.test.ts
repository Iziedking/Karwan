import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTKIT } from '@worldcoin/agentkit';
import { deriveHumanKeyDigest } from '../agentkit/agentKitVerification.js';
import { InMemoryResearchAllowanceStore } from '../evidence/researchAllowance.js';

process.env.NODE_ENV = 'test';
for (const name of [
  'KARWAN_JOBBOARD_ADDR',
  'KARWAN_ESCROW_ADDR',
  'KARWAN_REPUTATION_ADDR',
  'KARWAN_VAULT_ADDR',
  'USDC_ADDR',
  'IDENTITY_REGISTRY_ADDR',
]) {
  process.env[name] = '0x1111111111111111111111111111111111111111';
}

const { configureAgentKitResearch, researchRoutes } = await import('./research.js');

const RESOURCE = 'http://localhost/agentkit/verify';
const AGENT = '0x1111111111111111111111111111111111111111';
const HUMAN_KEY = deriveHumanKeyDigest(
  '01234567890123456789012345678901',
  'human-route-fixture',
);

test('verify endpoint challenges unsigned requests and persists only a verified retry', async () => {
  const store = new InMemoryResearchAllowanceStore();
  const reset = configureAgentKitResearch({
    enabled: true,
    allowanceStore: store,
    verifier: {
      async verify(input) {
        assert.equal(input.resourceUri, RESOURCE);
        assert.equal(input.header, 'signed-agentkit-header');
        return {
          status: 'verified' as const,
          agentAddress: AGENT,
          humanKeyDigest: HUMAN_KEY,
          verifier: 'world-agentbook' as const,
          checkedAt: 1_000,
          expiresAt: Date.now() + 60_000,
          domain: 'localhost',
          nonce: 'route-nonce',
        };
      },
    },
  });

  try {
    const challenge = await researchRoutes.request(RESOURCE, { method: 'POST' });
    assert.equal(challenge.status, 402);
    assert.equal(challenge.headers.get('cache-control'), 'no-store');
    const body = await challenge.json() as { extensions: Record<string, unknown> };
    assert.ok(body.extensions[AGENTKIT]);

    const verified = await researchRoutes.request(RESOURCE, {
      method: 'POST',
      headers: { [AGENTKIT]: 'signed-agentkit-header' },
    });
    assert.equal(verified.status, 200);
    assert.equal((await store.getBinding(AGENT))?.humanKeyDigest, HUMAN_KEY);

    const replay = await researchRoutes.request(RESOURCE, {
      method: 'POST',
      headers: { [AGENTKIT]: 'signed-agentkit-header' },
    });
    assert.equal(replay.status, 409);
  } finally {
    reset();
  }
});
