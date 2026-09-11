import { Hono } from 'hono';
import { config } from '../config.js';
import { withPostgresTransaction } from '../db/client.js';
import {
  createWorldIdRpSignature,
  createWorldIdVerifier,
  parseWorldIdResult,
  type IdKitResponseShape,
  type WorldIdEnvironment,
  type WorldIdVerifier,
} from '../worldid/idkitProof.js';

export interface WorldIdNullifierStore {
  claim(input: { nullifiers: string[]; action: string; environment: WorldIdEnvironment }): Promise<boolean>;
}

export function createPostgresWorldIdNullifierStore(): WorldIdNullifierStore {
  return {
    async claim({ nullifiers, action, environment }) {
      return withPostgresTransaction(async (tx) => {
        for (const nullifier of nullifiers) {
          const result = await tx.query(
            `INSERT INTO world_id_nullifiers_v1 (nullifier, action, environment, verified_at)
             VALUES ($1::numeric, $2, $3, $4)
             ON CONFLICT (nullifier, action) DO NOTHING`,
            [BigInt(nullifier).toString(), action, environment, Date.now()],
          );
          if (result.rows.length === 0) return false;
        }
        return true;
      });
    },
  };
}

let configuredStore: WorldIdNullifierStore | null = null;
let configuredVerifier: WorldIdVerifier = createWorldIdVerifier();

export function configureWorldIdProof(input: {
  store?: WorldIdNullifierStore;
  verifier?: WorldIdVerifier;
}): () => void {
  configuredStore = input.store ?? null;
  configuredVerifier = input.verifier ?? createWorldIdVerifier();
  return () => {
    configuredStore = null;
    configuredVerifier = createWorldIdVerifier();
  };
}

function configured(): boolean {
  return Boolean(
    config.WORLD_ID_ENABLED
      && config.WORLD_ID_APP_ID
      && config.WORLD_ID_RP_ID
      && config.WORLD_ID_ACTION
      && config.WORLD_ID_SIGNING_KEY
      && configuredStore,
  );
}

export function worldIdProofConfigured(): boolean {
  return configured();
}

export interface ConfiguredWorldIdVerification {
  verified: true;
  environment: WorldIdEnvironment;
  action: string;
  nullifiers: string[];
}

/** Shared verifier for deal-specific policies and the public World ID route. */
export async function verifyConfiguredWorldId(input: {
  idkitResponse: IdKitResponseShape;
  expectedNonce?: string;
}): Promise<
  | ConfiguredWorldIdVerification
  | { verified: false; code: 'WORLD_ID_UNAVAILABLE' | 'WORLD_ID_RESPONSE_INVALID' | 'WORLD_ID_PROOF_REJECTED' | 'WORLD_ID_NULLIFIER_REPLAY'; error: string }
> {
  if (!configured()) {
    return { verified: false, code: 'WORLD_ID_UNAVAILABLE', error: 'World ID verification is not configured' };
  }
  let parsed: ReturnType<typeof parseWorldIdResult>;
  try {
    parsed = parseWorldIdResult({
      result: input.idkitResponse,
      expectedAction: config.WORLD_ID_ACTION as string,
      expectedEnvironment: config.WORLD_ID_ENVIRONMENT,
      expectedNonce: input.expectedNonce,
    });
  } catch (error) {
    return {
      verified: false,
      code: 'WORLD_ID_RESPONSE_INVALID',
      error: error instanceof Error ? error.message : 'World ID response is invalid',
    };
  }
  let remote: Awaited<ReturnType<WorldIdVerifier['verify']>>;
  try {
    remote = await configuredVerifier.verify({
      rpId: config.WORLD_ID_RP_ID as string,
      result: input.idkitResponse,
    });
  } catch {
    return {
      verified: false,
      code: 'WORLD_ID_UNAVAILABLE',
      error: 'World ID verification service is unavailable',
    };
  }
  if (!remote.ok) return { verified: false, code: 'WORLD_ID_PROOF_REJECTED', error: remote.reason };
  let accepted: boolean;
  try {
    accepted = await configuredStore!.claim({
      nullifiers: parsed.nullifiers,
      action: parsed.action,
      environment: parsed.environment,
    });
  } catch {
    return {
      verified: false,
      code: 'WORLD_ID_UNAVAILABLE',
      error: 'World ID replay protection is unavailable',
    };
  }
  if (!accepted) {
    return {
      verified: false,
      code: 'WORLD_ID_NULLIFIER_REPLAY',
      error: 'World ID proof has already been used for this action',
    };
  }
  return {
    verified: true,
    environment: parsed.environment,
    action: parsed.action,
    nullifiers: parsed.nullifiers,
  };
}

export const worldIdRoutes = new Hono();

worldIdRoutes.get('/status', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({
    configured: configured(),
    environment: config.WORLD_ID_ENVIRONMENT,
    action: configured() ? config.WORLD_ID_ACTION : null,
    appId: configured() ? config.WORLD_ID_APP_ID : null,
    rpId: configured() ? config.WORLD_ID_RP_ID : null,
    provider: 'world-id-developer-portal' as const,
    proofMode: configured() ? 'sandbox-or-production' as const : 'unavailable' as const,
  });
});

worldIdRoutes.post('/rp-signature', async (c) => {
  c.header('Cache-Control', 'no-store');
  if (!configured()) return c.json({ error: 'World ID Sandbox is not configured', code: 'WORLD_ID_UNAVAILABLE' }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== config.WORLD_ID_ACTION) {
    return c.json({ error: 'World ID action is not allowed', code: 'WORLD_ID_ACTION_MISMATCH' }, 400);
  }
  try {
    return c.json(createWorldIdRpSignature({
      signingKeyHex: config.WORLD_ID_SIGNING_KEY as string,
      action: config.WORLD_ID_ACTION as string,
    }));
  } catch {
    return c.json({ error: 'World ID signing is unavailable', code: 'WORLD_ID_SIGNING_FAILED' }, 503);
  }
});

worldIdRoutes.post('/verify', async (c) => {
  c.header('Cache-Control', 'no-store');
  if (!configured()) return c.json({ error: 'World ID Sandbox is not configured', code: 'WORLD_ID_UNAVAILABLE' }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { idkitResponse?: IdKitResponseShape };
  if (!body.idkitResponse || typeof body.idkitResponse !== 'object') {
    return c.json({ error: 'IDKit response is required', code: 'WORLD_ID_RESPONSE_MISSING' }, 400);
  }
  const result = await verifyConfiguredWorldId({ idkitResponse: body.idkitResponse });
  if (!result.verified) {
    const status = result.code === 'WORLD_ID_RESPONSE_INVALID' ? 400 : result.code === 'WORLD_ID_NULLIFIER_REPLAY' ? 409 : result.code === 'WORLD_ID_PROOF_REJECTED' ? 403 : 503;
    return c.json({ error: result.error, code: result.code }, status);
  }
  return c.json({
    verified: true,
    provider: 'world-id-developer-portal' as const,
    environment: result.environment,
    action: result.action,
    nullifierCount: result.nullifiers.length,
  });
});
