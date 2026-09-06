/**
 * Owner-run World AgentKit proof. This signs only the short-lived CAIP-122
 * challenge returned by Karwan. It does not create a payment or transaction.
 * The wallet must already be registered through the owner-controlled AgentKit
 * CLI flow before this script can produce a verified result.
 */
import { createAgentkitClient } from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';

// @worldcoin/agentkit 0.2.1, read from its shipped dist source on 2026-09-06.
// Docs: https://docs.world.org/agents/agent-kit/integrate
const privateKey = process.env.AGENTKIT_PROBE_PRIVATE_KEY?.trim();
const apiBase = process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '');

if (!privateKey || !/^0x[0-9a-f]{64}$/i.test(privateKey)) {
  throw new Error('AGENTKIT_PROBE_PRIVATE_KEY must be a dedicated 32-byte EOA test key');
}
if (!apiBase) throw new Error('PUBLIC_API_BASE_URL is required');
const endpoint = new URL('/api/research/agentkit/verify', apiBase);
if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost') {
  throw new Error('AgentKit probe requires HTTPS except on localhost');
}

const account = privateKeyToAccount(privateKey as `0x${string}`);
const client = createAgentkitClient({
  signer: {
    address: account.address,
    chainId: `eip155:${arcTestnet.id}`,
    type: 'eip191',
    signMessage: (message) => account.signMessage({ message }),
  },
});

const response = await client.fetch(endpoint, { method: 'POST' });
const body = await response.json().catch(() => ({ error: 'response was not JSON' }));
process.stdout.write(`${JSON.stringify({
  executionMode: 'world-agentbook-provider',
  endpoint: endpoint.toString(),
  agentAddress: account.address,
  httpStatus: response.status,
  result: body,
})}\n`);
if (!response.ok) process.exitCode = 1;
