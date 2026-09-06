import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentkitClient, type AgentkitPayload } from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';
import { createAgentKitChallenge } from './agentKitChallenge.js';
import { createWorldAgentBookProvider } from './worldAgentBookProvider.js';

const RESOURCE = 'https://api.karwan.site/api/research/agentkit/verify';
const AGENT = '0x1111111111111111111111111111111111111111';
const NOW = Date.parse('2026-09-06T10:00:00.000Z');

function payload(overrides: Partial<AgentkitPayload> = {}): AgentkitPayload {
  return {
    domain: 'api.karwan.site',
    address: AGENT,
    uri: RESOURCE,
    version: '1',
    chainId: 'eip155:5042002',
    type: 'eip1271',
    nonce: '0123456789abcdef0123456789abcdef',
    issuedAt: '2026-09-06T09:59:00.000Z',
    expirationTime: '2026-09-06T10:04:00.000Z',
    signature: '0xsignature',
    ...overrides,
  };
}

function provider(input: {
  parsed?: AgentkitPayload;
  validation?: { valid: boolean; error?: string };
  signature?: { valid: boolean; address?: string; error?: string };
  lookup?: () => Promise<string | null>;
}) {
  const parsed = input.parsed ?? payload();
  return createWorldAgentBookProvider({
    now: () => NOW,
    sdk: {
      parseHeader: () => parsed,
      validateMessage: async () => input.validation ?? { valid: true },
      verifySignature: async () => input.signature ?? { valid: true, address: AGENT },
    },
    lookupHuman: input.lookup ?? (async () => '0x1234'),
  });
}

test('exact resource binding rejects a signed payload for another path on the same host', async () => {
  const result = await provider({
    parsed: payload({ uri: 'https://api.karwan.site/api/research/another-resource' }),
  }).verify({ header: 'base64-header', resourceUri: RESOURCE });

  assert.deepEqual(result, {
    status: 'rejected',
    message: 'AgentKit proof is bound to a different resource',
  });
});

test('a verified signature and AgentBook lookup return the nonce-bound human identity', async () => {
  const result = await provider({}).verify({ header: 'base64-header', resourceUri: RESOURCE });

  assert.deepEqual(result, {
    status: 'verified',
    result: {
      verified: true,
      agentAddress: AGENT,
      humanSubject: '0x1234',
      checkedAt: NOW,
      expiresAt: Date.parse('2026-09-06T10:04:00.000Z'),
      domain: 'api.karwan.site',
      nonce: '0123456789abcdef0123456789abcdef',
    },
  });
});

test('missing expiry, bad signatures, and unregistered agents are rejected', async () => {
  assert.equal((await provider({ parsed: payload({ expirationTime: undefined }) }).verify({ header: 'h', resourceUri: RESOURCE })).status, 'rejected');
  assert.equal((await provider({ signature: { valid: false, error: 'bad signature' } }).verify({ header: 'h', resourceUri: RESOURCE })).status, 'rejected');
  assert.equal((await provider({ lookup: async () => null }).verify({ header: 'h', resourceUri: RESOURCE })).status, 'rejected');
});

test('AgentBook transport failure remains unavailable instead of labelling the agent unregistered', async () => {
  const result = await provider({
    lookup: async () => { throw new Error('rpc timeout'); },
  }).verify({ header: 'h', resourceUri: RESOURCE });

  assert.deepEqual(result, {
    status: 'unavailable',
    message: 'World AgentBook lookup is unavailable',
  });
});

test('official AgentKit client header passes the real parser and EOA signature verifier', async () => {
  const now = new Date();
  const challenge = createAgentKitChallenge({
    resourceUri: RESOURCE,
    network: 'eip155:5042002',
    now,
    nonce: 'abcdefabcdefabcdefabcdefabcdefab',
  });
  const account = privateKeyToAccount(
    '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );
  const client = createAgentkitClient({
    signer: {
      address: account.address,
      chainId: 'eip155:5042002',
      type: 'eip191',
      signMessage: (message) => account.signMessage({ message }),
    },
  });
  const header = await client.createHeader(challenge.extensions.agentkit);
  const result = await createWorldAgentBookProvider({
    lookupHuman: async () => '0x4567',
  }).verify({ header, resourceUri: RESOURCE });

  assert.equal(result.status, 'verified');
  if (result.status !== 'verified') return;
  assert.equal(result.result.agentAddress, account.address.toLowerCase());
  assert.equal(result.result.humanSubject, '0x4567');
});
