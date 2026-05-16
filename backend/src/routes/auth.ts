import { Hono } from 'hono';
import { z } from 'zod';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { config } from '../config.js';
import {
  bumpCounter,
  createUser,
  getUserByCredentialId,
  getUserByEmail,
} from '../db/users.js';
import { provisionUserIdentityWallet } from '../circle/wallets.js';
import {
  clearSessionCookie,
  readSession,
  setSessionCookie,
} from '../auth/session.js';
import { logger } from '../logger.js';

const emailSchema = z.string().trim().toLowerCase().email().max(254);

// Pending WebAuthn ceremonies. Stored in memory keyed by email; expires after
// 5 minutes so abandoned signups don't accumulate. Production would persist
// to Redis so a multi-instance deployment can resume on any node.
interface PendingChallenge {
  challenge: string;
  email: string;
  /// 'register' kicks off provisioning a Circle wallet on verify; 'login'
  /// only validates the assertion and sets a session.
  kind: 'register' | 'login';
  expiresAt: number;
}
const pending = new Map<string, PendingChallenge>();
const PENDING_TTL_MS = 5 * 60 * 1000;

// Email OTP fallback for devices without a WebAuthn authenticator. Hashed
// 6-digit codes keyed by email, with a 10-minute TTL and an attempt counter
// that blocks brute force after 5 wrong tries. Same pattern as the WebAuthn
// challenge map; production swaps both to Redis.
interface PendingOtp {
  /// sha256(code + email) so memory inspection of the process doesn't leak
  /// plaintext codes. Kept short-lived anyway.
  codeHash: string;
  email: string;
  expiresAt: number;
  attempts: number;
}
const otps = new Map<string, PendingOtp>();
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string, email: string): string {
  return createHash('sha256').update(`${code}:${email}`).digest('hex');
}

function purgeStaleOtps() {
  const now = Date.now();
  for (const [k, v] of otps.entries()) {
    if (v.expiresAt < now) otps.delete(k);
  }
}

/// Stub email sender. Logs the code to the backend console with a clear
/// [OTP] prefix so devs can copy it in dev. Production swaps this for a
/// transactional sender (Resend / SendGrid) when #58 lands. In dev the code
/// also rides back on the request response so the modal can pre-fill it.
async function sendOtpEmail(email: string, code: string): Promise<void> {
  logger.info({ email, code }, '[OTP] code for login (replace with email sender)');
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function purgeStale() {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (v.expiresAt < now) pending.delete(k);
  }
}

function rp(): { id: string; name: string; origin: string } {
  return {
    id: config.WEBAUTHN_RP_ID ?? 'localhost',
    name: config.WEBAUTHN_RP_NAME ?? 'Karwan',
    origin: config.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
  };
}

function emailHash(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

function userIdBytes(email: string): Uint8Array<ArrayBuffer> {
  // Deterministic 32-byte user handle (WebAuthn allows up to 64). Reusing the
  // sha256 of the email means a passkey re-registration for the same email
  // resolves to the same user handle across devices. Backed by a plain
  // ArrayBuffer so simplewebauthn's strict Uint8Array<ArrayBuffer> param fits.
  const hex = emailHash(email);
  const buf = new ArrayBuffer(32);
  const out = new Uint8Array(buf);
  for (let i = 0; i < 32; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const authRoutes = new Hono();

/// Health probe for the frontend: is the passkey path wired? Returns false
/// when SESSION_SECRET / RP_ID are unset so the login modal can hide the
/// email tab cleanly instead of throwing on the first click.
authRoutes.get('/status', (c) => {
  const ok = !!config.SESSION_SECRET;
  return c.json({ configured: ok });
});

authRoutes.get('/me', (c) => {
  const session = readSession(c);
  if (!session) return c.json({ user: null });
  return c.json({
    user: {
      address: session.address,
      method: session.method,
      email: session.email,
    },
  });
});

authRoutes.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// ---------- REGISTER (new user) ----------

const startSchema = z.object({ email: emailSchema });

authRoutes.post('/register/options', async (c) => {
  let body;
  try {
    body = startSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  purgeStale();
  const existing = getUserByEmail(body.email);
  if (existing) {
    return c.json(
      { error: 'an account already exists for this email; sign in instead' },
      409,
    );
  }
  const { id: rpID, name: rpName } = rp();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userIdBytes(body.email),
    userName: body.email,
    userDisplayName: body.email,
    attestationType: 'none',
    authenticatorSelection: {
      // Resident keys make the email field optional on next login (the
      // browser can pick from saved passkeys), so we ask for them when the
      // platform supports it. Falls back to non-resident silently.
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  pending.set(body.email, {
    challenge: options.challenge,
    email: body.email,
    kind: 'register',
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  return c.json({ options });
});

const verifyRegisterSchema = z.object({
  email: emailSchema,
  response: z.any(),
});

authRoutes.post('/register/verify', async (c) => {
  let body;
  try {
    body = verifyRegisterSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const challenge = pending.get(body.email);
  if (!challenge || challenge.kind !== 'register') {
    return c.json({ error: 'no pending registration for this email' }, 400);
  }
  pending.delete(body.email);

  const { id: rpID, origin } = rp();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, email: body.email }, 'register verify failed');
    return c.json({ error: 'attestation verification failed' }, 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'attestation invalid' }, 400);
  }

  // simplewebauthn v11+ shapes this differently from older versions; we
  // adapt for both so a minor bump doesn't blow up the route.
  const info = verification.registrationInfo as unknown as {
    credentialID?: Uint8Array | Buffer | string;
    credentialPublicKey?: Uint8Array | Buffer;
    counter?: number;
    credential?: {
      id: string | Uint8Array | Buffer;
      publicKey: Uint8Array | Buffer;
      counter: number;
    };
  };

  function toB64Url(x: Uint8Array | Buffer | string): string {
    if (typeof x === 'string') return x;
    const buf = Buffer.isBuffer(x) ? x : Buffer.from(x);
    return buf.toString('base64url');
  }

  const credentialId = toB64Url(info.credential?.id ?? info.credentialID!);
  const publicKeyBytes = info.credential?.publicKey ?? info.credentialPublicKey!;
  const counter = info.credential?.counter ?? info.counter ?? 0;

  // Provision the user's Circle identity wallet. This is the address the
  // rest of the app will read for them.
  let identity;
  try {
    identity = await provisionUserIdentityWallet(emailHash(body.email));
  } catch (err) {
    logger.error(
      { err: (err as Error).message, email: body.email },
      'identity wallet provisioning failed; user not saved',
    );
    return c.json({ error: 'identity wallet provisioning failed' }, 502);
  }

  try {
    createUser({
      email: body.email,
      address: identity.address,
      circleIdentityWalletId: identity.walletId,
      credential: {
        credentialId,
        publicKey: toB64Url(publicKeyBytes),
        counter,
        transports:
          (body.response as RegistrationResponseJSON).response.transports ?? [],
        createdAt: Date.now(),
      },
    });
  } catch (err) {
    logger.error(
      { err: (err as Error).message, email: body.email },
      'createUser failed after wallet provisioned — Circle wallet exists but DB row missing; manual reconciliation needed',
    );
    return c.json({ error: 'account creation failed; please retry' }, 500);
  }

  setSessionCookie(c, {
    address: identity.address,
    method: 'circle',
    email: body.email,
  });

  logger.info({ email: body.email, address: identity.address }, 'circle user registered');
  return c.json({
    user: {
      address: identity.address,
      email: body.email,
      method: 'circle' as const,
    },
  });
});

// ---------- LOGIN (returning user) ----------

authRoutes.post('/login/options', async (c) => {
  let body;
  try {
    body = startSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  purgeStale();
  const user = getUserByEmail(body.email);
  if (!user) {
    return c.json({ error: 'no account for this email; register first' }, 404);
  }
  const { id: rpID } = rp();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: user.credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[] | undefined,
    })),
  });
  pending.set(body.email, {
    challenge: options.challenge,
    email: body.email,
    kind: 'login',
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  return c.json({ options });
});

const verifyLoginSchema = z.object({
  email: emailSchema,
  response: z.any(),
});

authRoutes.post('/login/verify', async (c) => {
  let body;
  try {
    body = verifyLoginSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const challenge = pending.get(body.email);
  if (!challenge || challenge.kind !== 'login') {
    return c.json({ error: 'no pending login for this email' }, 400);
  }
  pending.delete(body.email);

  const response = body.response as AuthenticationResponseJSON;
  const credentialId = response.id;
  const user = getUserByCredentialId(credentialId);
  if (!user || user.email !== body.email) {
    return c.json({ error: 'unknown credential' }, 400);
  }
  const credential = user.credentials.find((c) => c.credentialId === credentialId);
  if (!credential) return c.json({ error: 'credential not found' }, 400);

  const { id: rpID, origin } = rp();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      // Older + newer simplewebauthn shapes for the credential param.
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
        counter: credential.counter,
      },
    } as Parameters<typeof verifyAuthenticationResponse>[0]);
  } catch (err) {
    logger.warn({ err: (err as Error).message, email: body.email }, 'login verify failed');
    return c.json({ error: 'assertion verification failed' }, 400);
  }
  if (!verification.verified) {
    return c.json({ error: 'assertion invalid' }, 400);
  }

  const info = verification.authenticationInfo as unknown as {
    newCounter?: number;
  };
  if (typeof info.newCounter === 'number') {
    bumpCounter(credentialId, info.newCounter);
  }

  setSessionCookie(c, {
    address: user.address,
    method: 'circle',
    email: user.email,
  });
  logger.info({ email: user.email, address: user.address }, 'circle user signed in');
  return c.json({
    user: { address: user.address, email: user.email, method: 'circle' as const },
  });
});

// ---------- EMAIL OTP (passkey fallback) ----------

const otpRequestSchema = z.object({ email: emailSchema });

/// Issues a one-time 6-digit code for the email. Stub sender logs to console
/// in dev; production wires Resend / SendGrid via #58. Works for both new
/// and returning users; the verify step decides whether to create or log in.
authRoutes.post('/otp/request', async (c) => {
  let body;
  try {
    body = otpRequestSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  purgeStaleOtps();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  otps.set(body.email, {
    codeHash: hashCode(code, body.email),
    email: body.email,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  try {
    await sendOtpEmail(body.email, code);
  } catch (err) {
    logger.warn({ err: (err as Error).message, email: body.email }, 'otp send failed');
    // Keep going. dev sender doesn't fail; production sender failures
    // surface as a generic "couldn't send" so the user can retry.
  }
  return c.json({
    sent: true,
    // Returned only in dev so the user can autofill from the response panel
    // when running locally without an email sender. Never enabled in prod.
    ...(isDev() ? { devCode: code } : {}),
  });
});

const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'code must be 6 digits'),
});

authRoutes.post('/otp/verify', async (c) => {
  let body;
  try {
    body = otpVerifySchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const entry = otps.get(body.email);
  if (!entry) return c.json({ error: 'no code pending for this email' }, 400);
  if (entry.expiresAt < Date.now()) {
    otps.delete(body.email);
    return c.json({ error: 'code expired, request a fresh one' }, 400);
  }
  entry.attempts += 1;
  if (entry.attempts > OTP_MAX_ATTEMPTS) {
    otps.delete(body.email);
    return c.json({ error: 'too many wrong attempts, request a fresh code' }, 429);
  }
  const expected = Buffer.from(entry.codeHash, 'hex');
  const got = Buffer.from(hashCode(body.code, body.email), 'hex');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return c.json({ error: 'wrong code' }, 400);
  }
  otps.delete(body.email);

  // Resolve user. existing email logs in straight away; first-time email
  // provisions a Circle identity wallet so OTP and passkey share the same
  // account shape downstream. Without this an OTP-only user couldn't add a
  // passkey later because the WebAuthn registration path requires the row.
  let user = getUserByEmail(body.email);
  if (!user) {
    let identity;
    try {
      identity = await provisionUserIdentityWallet(emailHash(body.email));
    } catch (err) {
      logger.error(
        { err: (err as Error).message, email: body.email },
        'identity wallet provisioning failed during OTP signup',
      );
      return c.json({ error: 'identity wallet provisioning failed' }, 502);
    }
    try {
      user = createUser({
        email: body.email,
        address: identity.address,
        circleIdentityWalletId: identity.walletId,
        // Zero-credential row. user can register a passkey later; in the
        // meantime OTP is their only proof method.
        credential: {
          credentialId: '__otp_only_placeholder__',
          publicKey: '',
          counter: 0,
          createdAt: Date.now(),
        },
      });
      // The placeholder credential isn't a real passkey, so strip it after
      // create. The row stays valid (address + email) and a later passkey
      // registration appends a real credential.
      user.credentials = [];
    } catch (err) {
      logger.error(
        { err: (err as Error).message, email: body.email },
        'createUser failed during OTP signup',
      );
      return c.json({ error: 'account creation failed; please retry' }, 500);
    }
  }

  setSessionCookie(c, {
    address: user.address,
    method: 'circle',
    email: user.email,
  });
  logger.info({ email: user.email, address: user.address }, 'circle user signed in via OTP');
  return c.json({
    user: { address: user.address, email: user.email, method: 'circle' as const },
  });
});
