import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { evidenceHashOf, type StoredFact } from '../verification/evidence.js';
import type { Ladder } from '../verification/ladder.js';

const YEAR_MS = 365 * 24 * 3_600_000;

export interface PersonVerificationDeps {
  now: () => number;
  sessionAddress: (c: Context) => string | null;
  verifyWorldId: (
    idkitResponse: Record<string, unknown>,
  ) => Promise<{ verified: true; nullifiers: string[] } | { verified: false; code: string; error: string }>;
  /// Ties a World ID to one account. False when another account holds it.
  claimNullifier: (nullifier: string, address: string) => Promise<boolean>;
  addFact: (address: string, fact: StoredFact) => Promise<boolean>;
  levelOf: (address: string) => Promise<Ladder>;
  submitCac: (
    address: string,
    rc: string,
    name: string,
  ) => Promise<{ ok: true; status: 'review'; id: string } | { ok: false; reason: 'invalid_number' }>;
}

const WORLD_ID_STATUS: Record<string, 400 | 403 | 409 | 503> = {
  WORLD_ID_RESPONSE_INVALID: 400,
  WORLD_ID_PROOF_REJECTED: 403,
  WORLD_ID_NULLIFIER_REPLAY: 409,
};

const cacSchema = z.object({ rc: z.string().min(1).max(32), name: z.string().min(1).max(120) });

/// Verification a person does for their own account, not for one deal.
export function createPersonVerificationRoutes(deps: PersonVerificationDeps): Hono {
  const app = new Hono();

  app.post('/person', async (c) => {
    const address = deps.sessionAddress(c);
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { idkitResponse?: Record<string, unknown> };
    if (!body.idkitResponse || typeof body.idkitResponse !== 'object') {
      return c.json({ error: 'World ID response is required', code: 'WORLD_ID_RESPONSE_MISSING' }, 400);
    }
    const result = await deps.verifyWorldId(body.idkitResponse);
    if (!result.verified) return c.json({ error: result.error, code: result.code }, WORLD_ID_STATUS[result.code] ?? 503);

    for (const n of result.nullifiers) {
      if (!(await deps.claimNullifier(n, address))) {
        return c.json({ error: 'This World ID already verifies another Karwan account.', code: 'WORLD_ID_IN_USE' }, 409);
      }
    }
    const issuedAt = deps.now();
    await deps.addFact(address, {
      id: `person-${issuedAt}`,
      kind: 'person_check',
      level: 'person',
      issuedAt,
      expiresAt: issuedAt + YEAR_MS,
      evidenceHash: evidenceHashOf('person_check', ...result.nullifiers),
      source: 'world-id',
    });
    return c.json({ verified: true, level: await deps.levelOf(address) });
  });

  app.get('/me', async (c) => {
    const address = deps.sessionAddress(c);
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    return c.json({ level: await deps.levelOf(address) });
  });

  app.post('/cac', async (c) => {
    const address = deps.sessionAddress(c);
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const parsed = cacSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'Send the registration number and the registered name.' }, 400);
    const r = await deps.submitCac(address, parsed.data.rc, parsed.data.name);
    if (!r.ok) return c.json({ error: 'That is not an RC or BN number.', code: r.reason }, 400);
    return c.json(r);
  });

  return app;
}
