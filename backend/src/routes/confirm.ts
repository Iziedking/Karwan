import { createHash } from 'node:crypto';
import { Hono, type Context } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import type { EmailCodeCheck } from '../auth/otpStore.js';
import type { SessionPayload } from '../auth/session.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { presenceAction } from '../presence/action.js';
import { hashPin, normalizePin, pinGate, pinProblem } from '../presence/pin.js';
import { CHALLENGE_TTL_MS, CONFIRM_HEADER, freshOpenLink, type ConfirmResult, type PresenceService } from '../presence/service.js';
import type { PresencePasskey, PresenceStore } from '../presence/store.js';
import { invalidBodyMessage } from './invalidBody.js';

export interface ConfirmRouteDeps {
  service: PresenceService;
  store: PresenceStore;
  now: () => number;
  session: (c: Context) => SessionPayload | null;
  rp: () => { rpID: string; rpName: string; origin: string[] };
  loginPasskeys: (wallet: string) => Promise<PresencePasskey[]>;
  emailCodes: {
    request: (email: string) => Promise<{ delivered: boolean; devCode?: string; limited?: true }>;
    verify: (email: string, code: string) => EmailCodeCheck;
  };
  limit: { windowMs: number; max: number };
}

const confirmSchema = z.union([
  z.object({ challengeId: z.string().min(1), pin: z.string() }),
  z.object({ challengeId: z.string().min(1), passkey: z.record(z.unknown()) }),
  z.object({ challengeId: z.string().min(1), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }),
]);
const optionsSchema = z.object({ challengeId: z.string().min(1) });
const pinSchema = z.object({ pin: z.string(), emailCode: z.string().optional() });
const resetSchema = z.object({ pin: z.string(), emailCode: z.string() });
const passkeyOptionsSchema = z.object({ emailCode: z.string().optional() });
const registerSchema = z.object({ response: z.record(z.unknown()) });

const NO_EMAIL = { error: 'Add an email in the chat to reset your PIN.', code: 'NO_EMAIL' } as const;

/// Setting a PIN or a confirmation passkey, resetting the PIN by email code,
/// and confirming one of the actions a person must be present for.
export function createConfirmRoutes(deps: ConfirmRouteDeps): Hono {
  const app = new Hono();
  const registrations = new Map<string, { challenge: string; expiresAt: number }>();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('*', rateLimit({ ...deps.limit, name: 'confirm' }));

  const unauthenticated = (c: Context) => c.json({ error: 'not authenticated' }, 401);
  const body = async <T>(c: Context, schema: z.ZodType<T>): Promise<T | Response> => {
    try {
      return schema.parse(await c.req.json().catch(() => ({})));
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
  };

  const hasFactor = async (wallet: string) => {
    const [pin, own, login] = await Promise.all([deps.store.pin(wallet), deps.store.passkeys(wallet), deps.loginPasskeys(wallet)]);
    return { pin, passkeys: own.length + login.length, any: pin !== null || own.length + login.length > 0 };
  };

  const checkEmailCode = (c: Context, session: SessionPayload, code: string | undefined): Response | null => {
    if (!session.email) return c.json(NO_EMAIL, 409);
    if (!code) return c.json({ error: 'Enter the code we sent to your email.', code: 'ENROL_PROOF_REQUIRED' }, 403);
    return deps.emailCodes.verify(session.email, code) === 'ok'
      ? null
      : c.json({ error: 'That code is not right.', code: 'EMAIL_CODE_WRONG' }, 400);
  };

  /// A first PIN or passkey needs proof beyond the cookie; changing one is
  /// itself a confirmation.
  const mayChangeFactors = async (c: Context, session: SessionPayload, detail: Record<string, string>, emailCode?: string) => {
    const wallet = session.address.toLowerCase();
    if ((await hasFactor(wallet)).any) {
      const action = presenceAction({ kind: 'factor_change', wallet, amountMicros: null, recipient: null, detail });
      const result = await deps.service.confirmPresence({ account: session, action, proof: c.req.header(CONFIRM_HEADER) ?? null });
      return result.ok ? null : c.json(result.required, 428);
    }
    // An account with an email proves it by code; only an email-less chat
    // account may enrol from a fresh one-time link.
    if (session.email) return checkEmailCode(c, session, emailCode);
    if (freshOpenLink(session, deps.now())) return null;
    return c.json({ error: 'Open a new Karwan link from the chat to set your PIN.', code: 'ENROL_PROOF_REQUIRED' }, 403);
  };

  const pinRefusal = (c: Context, raw: string) => {
    const pin = normalizePin(raw);
    const problem = pin ? pinProblem(pin) : 'format';
    if (problem === 'too_simple') return { refusal: c.json({ error: "Pick a PIN that's harder to guess.", code: 'PIN_TOO_SIMPLE' }, 400) };
    if (problem || !pin) return { refusal: c.json({ error: 'A PIN is 6 digits.', code: 'PIN_FORMAT' }, 400) };
    return { pin };
  };

  const answer = (c: Context, r: ConfirmResult) => {
    if (r.ok) return c.json({ grant: r.grant });
    const { ok: _ok, ...rest } = r;
    return c.json(rest, r.code === 'PIN_LOCKED' ? 423 : 400);
  };

  app.get('/status', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    const methods = deps.service.methodsFor(session);
    const { pin, passkeys } = await hasFactor(session.address.toLowerCase());
    const lock = pin ? pinGate(pin, deps.now()) : { ok: true as const };
    return c.json({ methods, pinSet: pin !== null, pinLockedUntil: lock.ok ? null : lock.until, passkeys, hasEmail: !!session.email });
  });

  app.post('/', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    const b = await body(c, confirmSchema);
    if (b instanceof Response) return b;
    if ('pin' in b) return answer(c, await deps.service.confirmPin(session, b.challengeId, b.pin));
    if ('passkey' in b) return answer(c, await deps.service.confirmPasskey(session, b.challengeId, b.passkey as unknown as AuthenticationResponseJSON));
    return answer(c, await deps.service.confirmWallet(session, b.challengeId, b.signature as `0x${string}`));
  });

  app.post('/options', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    const b = await body(c, optionsSchema);
    if (b instanceof Response) return b;
    try {
      return c.json(await deps.service.passkeyOptions(session, b.challengeId));
    } catch (err) {
      return c.json({ code: (err as Error).message }, 400);
    }
  });

  app.post('/email-code', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    if (!session.email) return c.json(NO_EMAIL, 409);
    const r = await deps.emailCodes.request(session.email);
    if (r.limited) return c.json({ error: 'Too many codes. Try again in a few minutes.', code: 'EMAIL_CODE_LIMIT' }, 429);
    return c.json({ sent: r.delivered, ...(r.devCode ? { devCode: r.devCode } : {}) });
  });

  app.post('/pin', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    if (session.method === 'web3') return c.json({ error: 'Your wallet confirms for you.', code: 'METHOD_NOT_ALLOWED' }, 403);
    const b = await body(c, pinSchema);
    if (b instanceof Response) return b;
    const checked = pinRefusal(c, b.pin);
    if (checked.refusal) return checked.refusal;
    const refused = await mayChangeFactors(c, session, { change: 'pin' }, b.emailCode);
    if (refused) return refused;
    await deps.store.savePin(session.address, { hash: await hashPin(checked.pin), failures: 0, lockedUntil: null });
    return c.json({ ok: true });
  });

  app.post('/pin/reset', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    if (session.method === 'web3') return c.json({ error: 'Your wallet confirms for you.', code: 'METHOD_NOT_ALLOWED' }, 403);
    const b = await body(c, resetSchema);
    if (b instanceof Response) return b;
    const checked = pinRefusal(c, b.pin);
    if (checked.refusal) return checked.refusal;
    const refused = checkEmailCode(c, session, b.emailCode);
    if (refused) return refused;
    await deps.store.savePin(session.address, { hash: await hashPin(checked.pin), failures: 0, lockedUntil: null });
    return c.json({ ok: true });
  });

  app.post('/passkey/options', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    if (session.method === 'web3') return c.json({ error: 'Your wallet confirms for you.', code: 'METHOD_NOT_ALLOWED' }, 403);
    const b = await body(c, passkeyOptionsSchema);
    if (b instanceof Response) return b;
    const wallet = session.address.toLowerCase();
    const refused = await mayChangeFactors(c, session, { change: 'passkey_add' }, b.emailCode);
    if (refused) return refused;
    const { rpID, rpName } = deps.rp();
    const [own, login] = await Promise.all([deps.store.passkeys(wallet), deps.loginPasskeys(wallet)]);
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new Uint8Array(createHash('sha256').update(`karwan-confirm:${wallet}`).digest()),
      userName: session.email ?? 'Karwan account',
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      excludeCredentials: [...own, ...login].map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
    });
    registrations.set(wallet, { challenge: options.challenge, expiresAt: deps.now() + CHALLENGE_TTL_MS });
    return c.json(options);
  });

  app.post('/passkey/register', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    const b = await body(c, registerSchema);
    if (b instanceof Response) return b;
    const wallet = session.address.toLowerCase();
    const pending = registrations.get(wallet);
    registrations.delete(wallet);
    if (!pending || deps.now() > pending.expiresAt) return c.json({ error: 'Start again.', code: 'CHALLENGE_EXPIRED' }, 400);
    const { rpID, origin } = deps.rp();
    try {
      const verification = await verifyRegistrationResponse({
        response: b.response as unknown as RegistrationResponseJSON,
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) throw new Error('not verified');
      const { credential } = verification.registrationInfo;
      await deps.store.addPasskey({
        credentialId: credential.id,
        wallet,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ?? [],
        createdAt: deps.now(),
      });
    } catch {
      return c.json({ error: 'That passkey could not be added.', code: 'PASSKEY_FAILED' }, 400);
    }
    return c.json({ ok: true });
  });

  app.delete('/passkey/:credentialId', async (c) => {
    const session = deps.session(c);
    if (!session) return unauthenticated(c);
    const credentialId = c.req.param('credentialId');
    const refused = await mayChangeFactors(c, session, { change: 'passkey_remove', credentialId });
    if (refused) return refused;
    const removed = await deps.store.removePasskey(session.address, credentialId);
    return removed ? c.json({ ok: true }) : c.json({ error: 'passkey not found' }, 404);
  });

  return app;
}
