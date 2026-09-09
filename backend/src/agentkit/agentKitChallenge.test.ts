import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTKIT } from '@worldcoin/agentkit';
import { canonicalAgentKitResourceUri, createAgentKitChallenge } from './agentKitChallenge.js';

test('challenge is exact, short-lived, and compatible with the official AgentKit client', () => {
  const resourceUri = 'https://api.karwan.site/api/research/agentkit/verify';
  const challenge = createAgentKitChallenge({
    resourceUri,
    network: 'eip155:5042002',
    now: new Date('2026-09-06T10:00:00.000Z'),
    nonce: '0123456789abcdef0123456789abcdef',
  });

  const extension = challenge.extensions[AGENTKIT];
  assert.equal(challenge.error, 'AgentKit verification required');
  assert.equal(extension.info.domain, 'api.karwan.site');
  assert.equal(extension.info.uri, resourceUri);
  assert.equal(extension.info.expirationTime, '2026-09-06T10:05:00.000Z');
  assert.deepEqual(extension.supportedChains, [
    { chainId: 'eip155:5042002', type: 'eip191' },
    { chainId: 'eip155:5042002', type: 'eip1271' },
  ]);
  assert.deepEqual(extension.mode, { type: 'free-trial', uses: 3 });
});

test('canonical resource uses the configured API origin and strips query state', () => {
  assert.equal(
    canonicalAgentKitResourceUri(
      'http://internal:3001/api/research/agentkit/verify?attempt=2',
      'https://api.karwan.site/',
    ),
    'https://api.karwan.site/api/research/agentkit/verify',
  );
});
