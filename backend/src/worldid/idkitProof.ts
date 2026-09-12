import { signRequest } from '@worldcoin/idkit-core/signing';

export type WorldIdEnvironment = 'staging' | 'production';

export interface IdKitResponseShape {
  protocol_version?: string;
  nonce?: string;
  action?: string;
  environment?: WorldIdEnvironment;
  responses?: Array<{ nullifier?: string; session_nullifier?: string[] }>;
  [key: string]: unknown;
}

export interface WorldIdProofResult {
  nullifiers: string[];
  nonce: string;
  action: string;
  environment: WorldIdEnvironment;
}

export interface WorldIdVerifier {
  verify(input: {
    rpId: string;
    result: IdKitResponseShape;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export const WORLD_ID_VERIFY_ORIGIN = 'https://developer.world.org/api/v4/verify';

export function createWorldIdRpSignature(input: {
  signingKeyHex: string;
  action?: string;
}): { sig: string; nonce: string; created_at: number; expires_at: number } {
  const signed = signRequest({ signingKeyHex: input.signingKeyHex, action: input.action });
  return {
    sig: signed.sig,
    nonce: signed.nonce,
    created_at: signed.createdAt,
    expires_at: signed.expiresAt,
  };
}

export function parseWorldIdResult(input: {
  result: IdKitResponseShape;
  expectedAction: string;
  expectedEnvironment: WorldIdEnvironment;
  expectedNonce?: string;
}): WorldIdProofResult {
  const { result } = input;
  if (result.session_id !== undefined || result.responses?.some((response) => response.session_nullifier !== undefined)) {
    throw new Error('Session proofs require the authenticated deal endpoint');
  }
  if (result.action !== input.expectedAction) throw new Error('World ID action mismatch');
  if (result.environment !== input.expectedEnvironment) throw new Error('World ID environment mismatch');
  if (typeof result.nonce !== 'string' || result.nonce.length < 8) throw new Error('World ID nonce missing');
  if (input.expectedNonce && result.nonce !== input.expectedNonce) throw new Error('World ID nonce mismatch');
  const nullifiers = (result.responses ?? []).flatMap((response) => {
    const values = [] as string[];
    if (typeof response.nullifier === 'string') values.push(response.nullifier);
    return values;
  });
  const unique = [...new Set(nullifiers.map((value) => value.toLowerCase()))];
  if (unique.length === 0 || unique.some((value) => !/^0x[0-9a-f]{1,64}$/.test(value))) {
    throw new Error('World ID nullifier missing or malformed');
  }
  return {
    nullifiers: unique,
    nonce: result.nonce,
    action: result.action,
    environment: result.environment,
  };
}

export function createWorldIdVerifier(fetcher: typeof fetch = fetch): WorldIdVerifier {
  return {
    async verify({ rpId, result }) {
      const response = await fetcher(`${WORLD_ID_VERIFY_ORIGIN}/${encodeURIComponent(rpId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) return { ok: true };
      return { ok: false, reason: `World ID Developer Portal rejected the proof (${response.status})` };
    },
  };
}

