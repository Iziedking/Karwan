import { randomBytes } from 'node:crypto';
import {
  AGENTKIT,
  buildAgentkitSchema,
  type AgentkitExtension,
} from '@worldcoin/agentkit';

// @worldcoin/agentkit 0.2.1, read from its shipped dist source on 2026-09-06.
// Docs: https://docs.world.org/agents/agent-kit/sdk-reference
const CHALLENGE_TTL_MS = 5 * 60 * 1_000;

export interface AgentKitChallengeExtension extends AgentkitExtension {
  mode: { type: 'free-trial'; uses: 3 };
}

export interface AgentKitChallengeResponse {
  error: 'AgentKit verification required';
  extensions: Record<typeof AGENTKIT, AgentKitChallengeExtension>;
}

export function canonicalAgentKitResourceUri(
  incomingUrl: string,
  publicApiBaseUrl?: string,
): string {
  const incoming = new URL(incomingUrl);
  const base = publicApiBaseUrl ? new URL(publicApiBaseUrl) : incoming;
  return new URL(incoming.pathname, base.origin).toString();
}

export function createAgentKitChallenge(input: {
  resourceUri: string;
  network: `eip155:${number}`;
  now?: Date;
  nonce?: string;
}): AgentKitChallengeResponse {
  const resource = new URL(input.resourceUri);
  const now = input.now ?? new Date();
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  if (!/^[0-9a-f]{32}$/i.test(nonce)) throw new Error('AgentKit challenge nonce must be 16 random bytes');

  return {
    error: 'AgentKit verification required',
    extensions: {
      [AGENTKIT]: {
        info: {
          domain: resource.hostname,
          uri: resource.toString(),
          version: '1',
          nonce,
          issuedAt: now.toISOString(),
          expirationTime: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
          resources: [resource.toString()],
          statement: 'Verify this agent is backed by a person before granting a complimentary report',
        },
        supportedChains: [
          { chainId: input.network, type: 'eip191' },
          { chainId: input.network, type: 'eip1271' },
        ],
        schema: buildAgentkitSchema(),
        mode: { type: 'free-trial', uses: 3 },
      },
    },
  };
}
