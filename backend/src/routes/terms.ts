import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { highestAcceptedVersion, recordAcceptance } from '../db/termsAcceptances.js';
import { readSession } from '../auth/session.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

export const termsRoutes = new Hono();

/// Public status read. Returns the current required version and the highest
/// version the queried address has accepted (or null). The frontend uses this
/// to decide whether to mount the TermsModal gate.
termsRoutes.get('/status', (c) => {
  const address = c.req.query('address');
  const currentVersion = config.TERMS_CURRENT_VERSION;
  if (!address) {
    return c.json({ currentVersion, acceptedVersion: null });
  }
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) {
    return c.json({ error: 'invalid address' }, 400);
  }
  const acceptedVersion = highestAcceptedVersion(parsed.data);
  return c.json({ currentVersion, acceptedVersion });
});

/// Recorded acceptance, gated on a valid session cookie. The body just carries
/// the version the user is accepting. We pin the session address as the row
/// key, never trust a client-supplied address here.
termsRoutes.post('/accept', async (c) => {
  const session = readSession(c);
  if (!session) {
    return c.json({ error: 'sign in before accepting the terms' }, 401);
  }
  let body: { version: number };
  try {
    body = z.object({ version: z.number().int().positive() }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.version !== config.TERMS_CURRENT_VERSION) {
    return c.json(
      {
        error: 'this is not the current version. Reload and accept the latest one.',
        code: 'STALE_VERSION',
        currentVersion: config.TERMS_CURRENT_VERSION,
      },
      409,
    );
  }
  const userAgent = c.req.header('user-agent') ?? undefined;
  recordAcceptance({
    address: session.address,
    version: body.version,
    acceptedAt: Date.now(),
    userAgent,
  });
  logger.info(
    { address: session.address, version: body.version },
    'terms acceptance recorded',
  );
  return c.json({ ok: true, version: body.version });
});
