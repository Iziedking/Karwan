import { Hono } from 'hono';
import { z } from 'zod';
import { verifyMessage } from 'viem';
import { config } from '../config.js';
import { highestAcceptedVersion, recordAcceptance } from '../db/termsAcceptances.js';
import { readSession } from '../auth/session.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

/// The exact text a web3 user signs to accept the terms. MUST byte-for-byte
/// match the frontend builder in shared/hooks/useTerms.ts, or the signature
/// won't verify. Address is lowercased so both sides build the identical string.
export function termsAcceptanceMessage(address: string, version: number): string {
  return `Karwan Terms of Use\n\nI accept version ${version}.\n\nWallet: ${address.toLowerCase()}`;
}

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
  let body: { version: number; signature?: string };
  try {
    body = z
      .object({
        version: z.number().int().positive(),
        signature: z.string().regex(/^0x[a-fA-F0-9]+$/).optional(),
      })
      .parse(await c.req.json());
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

  // Web3 users sign their acceptance with the same wallet they SIWE'd with; the
  // signature is the proof of consent, verified against the exact canonical
  // message. Circle (email/passkey) users have no EOA to sign — their acceptance
  // is the authenticated click, since they already proved identity via passkey/
  // OTP. So the signature is REQUIRED for web3 sessions and absent for circle.
  let signature: string | undefined;
  if (session.method === 'web3') {
    if (!body.signature) {
      return c.json({ error: 'a wallet signature is required to accept', code: 'SIGNATURE_REQUIRED' }, 400);
    }
    const message = termsAcceptanceMessage(session.address, body.version);
    let valid = false;
    try {
      valid = await verifyMessage({
        address: session.address as `0x${string}`,
        message,
        signature: body.signature as `0x${string}`,
      });
    } catch {
      valid = false;
    }
    if (!valid) {
      return c.json({ error: 'that signature did not verify against your wallet', code: 'BAD_SIGNATURE' }, 401);
    }
    signature = body.signature;
  }

  const userAgent = c.req.header('user-agent') ?? undefined;
  recordAcceptance({
    address: session.address,
    version: body.version,
    acceptedAt: Date.now(),
    userAgent,
    signature,
  });
  logger.info(
    { address: session.address, version: body.version, signed: !!signature },
    'terms acceptance recorded',
  );
  return c.json({ ok: true, version: body.version });
});
