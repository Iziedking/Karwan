import { createHmac, timingSafeEqual } from 'node:crypto';

export const AGENTKIT_DOMAIN = 'karwan.research';

export type AgentKitVerificationStatus = 'verified' | 'unavailable' | 'rejected';

export interface AgentKitVerificationRequest {
  agentAddress: string;
  domain: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
  proof: unknown;
}

export interface AgentKitVerifiedIdentity {
  status: 'verified';
  agentAddress: string;
  humanKeyDigest: string;
  verifier: 'world-agentbook';
  checkedAt: number;
  expiresAt: number;
}

export interface AgentKitVerificationFailure {
  status: Exclude<AgentKitVerificationStatus, 'verified'>;
  code: 'PROVIDER_UNAVAILABLE' | 'PROOF_REJECTED';
  message: string;
}

export type AgentKitVerificationResult = AgentKitVerifiedIdentity | AgentKitVerificationFailure;

export interface AgentKitProviderResult {
  verified: boolean;
  agentAddress: string;
  humanSubject: string;
  checkedAt: number;
  expiresAt: number;
}

export interface AgentKitProvider {
  verify(input: AgentKitVerificationRequest): Promise<
    | { status: 'verified'; result: AgentKitProviderResult }
    | { status: 'unavailable'; message: string }
    | { status: 'rejected'; message: string }
  >;
}

export interface AgentKitVerifier {
  verify(input: AgentKitVerificationRequest): Promise<AgentKitVerificationResult>;
}

export class AgentKitRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentKitRequestError';
  }
}

function normalizeAddress(value: string): string {
  const address = value.trim();
  if (!/^0x[0-9a-f]{40}$/i.test(address)) {
    throw new AgentKitRequestError('agent address is invalid');
  }
  return address.toLowerCase();
}

function assertRequest(input: AgentKitVerificationRequest, now: number): AgentKitVerificationRequest {
  const agentAddress = normalizeAddress(input.agentAddress);
  if (input.domain !== AGENTKIT_DOMAIN) throw new AgentKitRequestError('agent proof domain is invalid');
  if (!input.nonce.trim() || input.nonce.length > 256) throw new AgentKitRequestError('agent proof nonce is invalid');
  if (!input.signature.trim()) throw new AgentKitRequestError('agent proof signature is required');
  if (!Number.isSafeInteger(input.issuedAt) || !Number.isSafeInteger(input.expiresAt)) {
    throw new AgentKitRequestError('agent proof timestamps are invalid');
  }
  if (input.expiresAt <= now || input.issuedAt > now + 60_000) {
    throw new AgentKitRequestError('agent proof is expired or from the future');
  }
  if (input.expiresAt - input.issuedAt > 15 * 60_000) {
    throw new AgentKitRequestError('agent proof lifetime is too long');
  }
  return { ...input, agentAddress };
}

export function deriveHumanKeyDigest(secret: string, humanSubject: string): string {
  const key = secret.trim();
  const subject = humanSubject.trim();
  if (key.length < 32) throw new AgentKitRequestError('agent identity secret is not configured');
  if (!subject) throw new AgentKitRequestError('verified human subject is missing');
  return createHmac('sha256', key).update(`karwan-agentbook\0${subject}`).digest('hex');
}

export function createAgentKitVerifier(input: {
  provider: AgentKitProvider;
  humanKeySecret: string;
  now?: () => number;
}): AgentKitVerifier {
  return {
    async verify(request) {
      const now = input.now?.() ?? Date.now();
      let checked: AgentKitVerificationRequest;
      try {
        checked = assertRequest(request, now);
      } catch (error) {
        return {
          status: 'rejected',
          code: 'PROOF_REJECTED',
          message: error instanceof Error ? error.message : 'agent proof rejected',
        };
      }

      const response = await input.provider.verify(checked);
      if (response.status === 'unavailable') {
        return { status: 'unavailable', code: 'PROVIDER_UNAVAILABLE', message: response.message };
      }
      if (response.status === 'rejected' || !response.result.verified) {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: response.message ?? 'agent proof rejected' };
      }
      if (response.result.agentAddress.toLowerCase() !== checked.agentAddress) {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: 'provider returned a different agent address' };
      }
      if (response.result.expiresAt <= now || response.result.expiresAt > checked.expiresAt) {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: 'provider proof expiry is invalid' };
      }
      return {
        status: 'verified',
        agentAddress: checked.agentAddress,
        humanKeyDigest: deriveHumanKeyDigest(input.humanKeySecret, response.result.humanSubject),
        verifier: 'world-agentbook',
        checkedAt: response.result.checkedAt,
        expiresAt: response.result.expiresAt,
      };
    },
  };
}

export function unavailableAgentKitVerifier(message = 'AgentBook verification is not configured'): AgentKitVerifier {
  return {
    async verify() {
      return { status: 'unavailable', code: 'PROVIDER_UNAVAILABLE', message };
    },
  };
}

export function sameDigest(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
