import { createHash } from 'node:crypto';
import type { WorldIdEnvironment } from './idkitProof.js';

export function parseSessionProof(result: Record<string, unknown>, expected: {
  nonce: string; environment: WorldIdEnvironment; nowSeconds: number; sessionId?: string;
}) {
  if (result.protocol_version !== '4.0' || result.action !== undefined) throw new Error('A World ID session proof is required');
  if (result.nonce !== expected.nonce || result.environment !== expected.environment) throw new Error('World ID request mismatch');
  if (typeof result.session_id !== 'string' || !/^session_[0-9a-fA-F]+$/.test(result.session_id) || result.session_id.length > 264) {
    throw new Error('World ID session missing or malformed');
  }
  if (expected.sessionId && result.session_id !== expected.sessionId) throw new Error('World ID session mismatch');
  if (result.user_presence_completed !== true) throw new Error('Complete the World ID presence check');
  if (!Array.isArray(result.responses) || result.responses.length !== 1) throw new Error('One Selfie credential is required');
  const response = result.responses[0];
  if (!response || response.identifier !== 'selfie' || response.issuer_schema_id !== 11
    || !Number.isSafeInteger(response.expires_at_min) || response.expires_at_min <= expected.nowSeconds
    || !Array.isArray(response.proof) || response.proof.length === 0
    || !response.proof.every((value: unknown) => typeof value === 'string')
    || !Array.isArray(response.session_nullifier) || response.session_nullifier.length !== 2) {
    throw new Error('A current Selfie session credential is required');
  }
  const pair = response.session_nullifier.map((value: unknown) => {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) throw new Error('Invalid session replay value');
    return BigInt(value).toString();
  });
  // IDKit core 4.2.4: [session nullifier, generated action] is one replay pair.
  // https://docs.world.org/world-id/4-0-migration (verified 2026-09-12).
  return {
    sessionId: result.session_id,
    replayKey: createHash('sha256').update(pair.join(':')).digest('hex'),
    responseDigest: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
  };
}
