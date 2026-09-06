import {
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  type AgentkitPayload,
  type AgentkitSignatureVerificationOptions,
  type AgentkitValidationResult,
  type AgentkitVerifyResult,
} from '@worldcoin/agentkit';
import { createPublicClient, http, toHex } from 'viem';
import { worldchain } from 'viem/chains';
import type { AgentKitProvider } from './agentKitVerification.js';

// @worldcoin/agentkit 0.2.1, read from its shipped dist types and source on
// 2026-09-06. Docs: https://docs.world.org/agents/agent-kit/sdk-reference
// The SDK validates host equality but not the full resource path, and its
// createAgentBookVerifier helper converts RPC failures to null. This seam adds
// exact-path binding and keeps transport failure separate from no registration.
const WORLD_AGENT_BOOK_ADDRESS = '0xA23aB2712eA7BBa896930544C7d6636a96b944dA';
const MAX_PROOF_LIFETIME_MS = 5 * 60 * 1_000;
const AGENT_BOOK_ABI = [{
  type: 'function',
  name: 'lookupHuman',
  stateMutability: 'view',
  inputs: [{ name: '', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;

interface WorldAgentKitSdk {
  parseHeader(header: string): AgentkitPayload;
  validateMessage(
    payload: AgentkitPayload,
    resourceUri: string,
    options: { maxAge: number },
  ): Promise<AgentkitValidationResult>;
  verifySignature(
    payload: AgentkitPayload,
    options?: AgentkitSignatureVerificationOptions,
  ): Promise<AgentkitVerifyResult>;
}

const officialSdk: WorldAgentKitSdk = {
  parseHeader: parseAgentkitHeader,
  validateMessage: validateAgentkitMessage,
  verifySignature: verifyAgentkitSignature,
};

function evmAddress(value: string): `0x${string}` | null {
  const normalized = value.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized as `0x${string}` : null;
}

function defaultHumanLookup(rpcUrl?: string): (address: `0x${string}`) => Promise<string | null> {
  const client = createPublicClient({
    chain: worldchain,
    transport: http(rpcUrl),
  });
  return async (address) => {
    const humanId = await client.readContract({
      address: WORLD_AGENT_BOOK_ADDRESS,
      abi: AGENT_BOOK_ABI,
      functionName: 'lookupHuman',
      args: [address],
    });
    return humanId === 0n ? null : toHex(humanId);
  };
}

export function createWorldAgentBookProvider(input: {
  worldRpcUrl?: string;
  signatureRpcUrls?: Record<string, string>;
  now?: () => number;
  sdk?: WorldAgentKitSdk;
  lookupHuman?: (address: `0x${string}`) => Promise<string | null>;
} = {}): AgentKitProvider {
  const sdk = input.sdk ?? officialSdk;
  const lookupHuman = input.lookupHuman ?? defaultHumanLookup(input.worldRpcUrl);

  return {
    async verify(request) {
      let payload: AgentkitPayload;
      try {
        payload = sdk.parseHeader(request.header);
      } catch {
        return { status: 'rejected', message: 'AgentKit header is malformed' };
      }

      const validation = await sdk.validateMessage(payload, request.resourceUri, {
        maxAge: MAX_PROOF_LIFETIME_MS,
      });
      if (!validation.valid) {
        return { status: 'rejected', message: validation.error ?? 'AgentKit proof validation failed' };
      }
      if (payload.uri !== request.resourceUri) {
        return { status: 'rejected', message: 'AgentKit proof is bound to a different resource' };
      }

      const issuedAt = Date.parse(payload.issuedAt);
      const expiresAt = payload.expirationTime ? Date.parse(payload.expirationTime) : Number.NaN;
      const now = input.now?.() ?? Date.now();
      if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - issuedAt > MAX_PROOF_LIFETIME_MS) {
        return { status: 'rejected', message: 'AgentKit proof expiry is invalid' };
      }

      const signature = await sdk.verifySignature(
        payload,
        input.signatureRpcUrls ? { rpcUrls: input.signatureRpcUrls } : undefined,
      );
      const signedAddress = signature.address ? evmAddress(signature.address) : null;
      const claimedAddress = evmAddress(payload.address);
      if (!signature.valid || !signedAddress || !claimedAddress || signedAddress !== claimedAddress) {
        return { status: 'rejected', message: signature.error ?? 'AgentKit signature verification failed' };
      }

      let humanSubject: string | null;
      try {
        humanSubject = await lookupHuman(signedAddress);
      } catch {
        return { status: 'unavailable', message: 'World AgentBook lookup is unavailable' };
      }
      if (!humanSubject) {
        return { status: 'rejected', message: 'Agent is not registered in World AgentBook' };
      }

      return {
        status: 'verified',
        result: {
          verified: true,
          agentAddress: signedAddress,
          humanSubject,
          checkedAt: now,
          expiresAt,
          domain: payload.domain,
          nonce: payload.nonce,
        },
      };
    },
  };
}
