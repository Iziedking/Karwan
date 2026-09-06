import { createHmac, timingSafeEqual } from 'node:crypto';

export type AgentKitVerificationStatus = 'verified' | 'unavailable' | 'rejected';

export interface AgentKitVerificationRequest {
  header: string;
  resourceUri: string;
}

export interface AgentKitVerifiedIdentity {
  status: 'verified';
  agentAddress: string;
  humanKeyDigest: string;
  verifier: 'world-agentbook';
  checkedAt: number;
  expiresAt: number;
  domain: string;
  nonce: string;
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
  domain: string;
  nonce: string;
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
  const humanKeySecret = input.humanKeySecret.trim();
  if (humanKeySecret.length < 32) {
    throw new AgentKitRequestError('agent identity secret is not configured');
  }
  return {
    async verify(request) {
      const now = input.now?.() ?? Date.now();
      try {
        new URL(request.resourceUri);
      } catch {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: 'agent resource URI is invalid' };
      }
      if (!request.header.trim()) {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: 'agentkit header is required' };
      }

      let response: Awaited<ReturnType<AgentKitProvider['verify']>>;
      try {
        response = await input.provider.verify(request);
      } catch {
        return { status: 'unavailable', code: 'PROVIDER_UNAVAILABLE', message: 'AgentKit provider is unavailable' };
      }
      if (response.status === 'unavailable') {
        return { status: 'unavailable', code: 'PROVIDER_UNAVAILABLE', message: response.message };
      }
      if (response.status === 'rejected') {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: response.message };
      }
      if (!response.result.verified) {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: 'agent proof rejected' };
      }
      let agentAddress: string;
      try {
        agentAddress = normalizeAddress(response.result.agentAddress);
      } catch {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: 'provider returned an invalid agent address' };
      }
      if (response.result.expiresAt <= now) {
        return { status: 'rejected', code: 'PROOF_REJECTED', message: 'provider proof expiry is invalid' };
      }
      return {
        status: 'verified',
        agentAddress,
        humanKeyDigest: deriveHumanKeyDigest(humanKeySecret, response.result.humanSubject),
        verifier: 'world-agentbook',
        checkedAt: response.result.checkedAt,
        expiresAt: response.result.expiresAt,
        domain: response.result.domain,
        nonce: response.result.nonce,
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
