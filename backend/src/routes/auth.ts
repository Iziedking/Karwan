import { Hono } from 'hono';
import { z } from 'zod';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { rateLimit } from '../middleware/rateLimit.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { resendClient } from '../emails/resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID } from '../emails/brand.js';
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
  appendCredential,
  bumpCounter,
  createUser,
  getUserByCredentialId,
  getUserByEmail,
  hasRealPasskey,
  OTP_PLACEHOLDER_CREDENTIAL_ID,
} from '../db/users.js';
import { provisionUserIdentityWallet, dripTestnetUsdc } from '../circle/wallets.js';
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
const pending = durableEphemeralMap<PendingChallenge>('webauthn');
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
const otps = durableEphemeralMap<PendingOtp>('otp');
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

interface OtpSendResult {
  delivered: boolean;
  /// Surfaced when delivery failed so the modal can show a real message
  /// instead of a silent fallback to the dev pill. Empty string when the
  /// log-only path was the intended one (no provider configured).
  reason?: string;
}

/// HTML body for the OTP email. Uses the shared brand shell. Digits sit in a
/// monospace block with a calm letter-spacing, no manual &nbsp; padding,
/// which was making the code read like "1   2   3" instead of "123456".
function otpEmailHtml(code: string): string {
  const inner = `
          <tr>
            <td style="padding:36px 28px 12px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Your code</div>
              <div style="display:inline-block;padding:18px 28px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:14px 14px 14px 4px;">
                <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:36px;font-weight:800;letter-spacing:0.32em;color:#0e0e0e;line-height:1;padding-right:0.32em;">${code}</div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 8px 28px;text-align:center;">
              <p style="margin:0;font-size:14px;line-height:1.55;color:#3a352c;">
                Enter this code in the sign-in modal to access your Karwan account.
              </p>
              <p style="margin:10px 0 0 0;font-size:13px;line-height:1.55;color:#7a7466;">
                Expires in 10 minutes. Five wrong tries voids it.
              </p>
            </td>
          </tr>
  `;
  return brandedEmailHtml({
    eyebrow: 'SIGN-IN CODE',
    title: 'Karwan sign-in code',
    inner,
  });
}

/// Sends the 6-digit code to the user. When RESEND_API_KEY is set we POST to
/// Resend; otherwise we log the code to the backend terminal so dev still
/// works without any provider configured. Returns whether the code went out
/// over real email. The dev autofill pill only renders when this is false.
async function sendOtpEmail(email: string, code: string): Promise<OtpSendResult> {
  const client = resendClient();
  if (!client) {
    // Dev convenience only. In production a login code in the log stream is a
    // credential leak (log aggregation, shell history, backup archives), so
    // the code is never printed there; without a provider it simply does not
    // deliver.
    if (isDev()) logger.info({ email, code }, '[OTP] code (no RESEND_API_KEY, log-only)');
    return { delivered: false };
  }
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      /// Replies on the OTP email route to the human-monitored inbox.
      /// Sender stays the configured no-reply alias so we keep DKIM/SPF
      /// aligned on the verified domain, but a recipient who hits Reply
      /// lands at support@ where it'll be picked up.
      replyTo: 'support@karwan.site',
      to: email,
      subject: `Karwan sign-in code: ${code}`,
      html: otpEmailHtml(code),
      text:
        `Your Karwan sign-in code is ${code}\n\n` +
        `It expires in 10 minutes. Five wrong tries voids it.\n\n` +
        `If you didn't request this, ignore the email.`,
      // CID inline attachment for the brand mark. Falls back gracefully when
      // the asset isn't on disk (the HTML omits the <img> in that case too).
      ...(LOGO_BUFFER
        ? {
            attachments: [
              {
                filename: 'karwan-logo.png',
                content: LOGO_BUFFER,
                contentId: LOGO_CID,
              },
            ],
          }
        : {}),
    });
    if (error) {
      // Resend returns its rejection in `error` with no throw, so we must
      // inspect it explicitly. Common cases:
      //   - "You can only send testing emails to your own email address" →
      //     the sandbox sender `onboarding@resend.dev` only delivers to the
      //     Resend account owner's email. Verify a domain to send to anyone.
      //   - "Invalid `from` field" → RESEND_FROM is malformed.
      //   - "Invalid API key" → key revoked or wrong key.
      logger.warn(
        { err: error.message, errName: error.name, email, from: config.RESEND_FROM },
        'resend rejected send',
      );
      if (isDev()) logger.info({ email, code }, '[OTP] code (resend rejected, log fallback)');
      return { delivered: false, reason: error.message };
    }
    logger.info({ email, id: data?.id }, 'OTP code emailed via resend');
    return { delivered: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    logger.warn({ err: message, email }, 'resend threw');
    if (isDev()) logger.info({ email, code }, '[OTP] code (resend threw, log fallback)');
    return { delivered: false, reason: message };
  }
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

function rp(): { id: string; name: string; origin: string[] } {
  const id = config.WEBAUTHN_RP_ID ?? 'localhost';
  const baseOrigin = config.WEBAUTHN_ORIGIN ?? 'http://localhost:3000';
  // Accept the apex + www variant + localhost dev origins. Mobile browsers
  // sometimes land on www.<domain> via autocomplete, and a passkey registered
  // on the apex must still validate from www and back.
  const origins = new Set<string>([baseOrigin, baseOrigin.replace(/\/$/, '')]);
  if (id !== 'localhost') {
    origins.add(`https://${id}`);
    origins.add(`https://www.${id}`);
  }
  origins.add('http://localhost:3000');
  origins.add('http://127.0.0.1:3000');
  return {
    id,
    name: config.WEBAUTHN_RP_NAME ?? 'Karwan',
    origin: Array.from(origins),
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
  // Surface hasPasskey so the frontend can decide whether to offer an "Add
  // a passkey" CTA in Settings. Only meaningful for Circle users; wallet
  // users don't have a credentials row.
  let hasPasskey = false;
  if (session.method === 'circle' && session.email) {
    const user = getUserByEmail(session.email);
    hasPasskey = !!user && hasRealPasskey(user);
  }
  return c.json({
    user: {
      address: session.address,
      method: session.method,
      email: session.email,
      hasPasskey,
    },
  });
});

authRoutes.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// ---------- LOOKUP (unified login surface) ----------

/// One round-trip the frontend makes after the user enters their email.
/// Tells the UI which path to drive: register vs sign-in, passkey vs OTP.
/// Never reveals whether passkey *credentials* exist for security; only
/// whether any account row exists, and whether that row has at least one
/// passkey credential attached.
const lookupSchema = z.object({ email: emailSchema });

authRoutes.post('/lookup', async (c) => {
  let body;
  try {
    body = lookupSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const user = getUserByEmail(body.email);
  return c.json({
    exists: !!user,
    hasPasskey: !!user && hasRealPasskey(user),
  });
});

// ---------- ADD PASSKEY (authenticated, existing account) ----------

/// For users who signed up via OTP and want to add a passkey to their account
/// later. Mirrors the /register/options flow but requires an active session
/// instead of taking an email argument, so the user can only add a passkey
/// to their OWN account. Reuses the same WebAuthn helpers and stores the
/// new credential via appendCredential().
authRoutes.post('/passkey/add/options', async (c) => {
  const session = readSession(c);
  if (!session || session.method !== 'circle' || !session.email) {
    return c.json({ error: 'not signed in' }, 401);
  }
  purgeStale();
  const user = getUserByEmail(session.email);
  if (!user) return c.json({ error: 'no account row for this session' }, 404);
  const { id: rpID, name: rpName } = rp();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userIdBytes(session.email),
    userName: session.email,
    userDisplayName: session.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    // Exclude real credentials the user already has so the platform offers
    // fresh authenticators rather than overwriting an existing key. Skip the
    // legacy OTP placeholder, which isn't a real authenticator.
    excludeCredentials: user.credentials
      .filter((c) => c.credentialId !== OTP_PLACEHOLDER_CREDENTIAL_ID && !!c.publicKey)
      .map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[] | undefined,
      })),
  });
  pending.set(session.email, {
    challenge: options.challenge,
    email: session.email,
    kind: 'register',
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  return c.json({ options });
});

const passkeyAddVerifySchema = z.object({
  email: emailSchema,
  response: z.any(),
});

authRoutes.post('/passkey/add/verify', async (c) => {
  const session = readSession(c);
  if (!session || session.method !== 'circle' || !session.email) {
    return c.json({ error: 'not signed in' }, 401);
  }
  let body;
  try {
    body = passkeyAddVerifySchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  // Guard against the body email diverging from the session email. A user
  // can only add a passkey to their own account.
  if (body.email !== session.email) {
    return c.json({ error: 'email mismatch' }, 403);
  }
  const challenge = pending.get(session.email);
  if (!challenge || challenge.kind !== 'register') {
    return c.json({ error: 'no pending passkey add for this session' }, 400);
  }
  pending.delete(session.email);

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
    logger.warn(
      {
        err: (err as Error).message,
        email: session.email,
        expectedRPID: rpID,
        expectedOrigins: origin,
        clientDataJSON: (body.response as RegistrationResponseJSON)?.response?.clientDataJSON,
      },
      'passkey add verify failed',
    );
    return c.json({ error: 'attestation verification failed' }, 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'attestation invalid' }, 400);
  }

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

  appendCredential(session.email, {
    credentialId,
    publicKey: toB64Url(publicKeyBytes),
    counter,
    createdAt: Date.now(),
  });
  logger.info({ email: session.email }, 'passkey added to existing account');
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
    logger.warn(
      {
        err: (err as Error).message,
        email: body.email,
        expectedRPID: rpID,
        expectedOrigins: origin,
        clientDataJSON: (body.response as RegistrationResponseJSON)?.response?.clientDataJSON,
      },
      'register verify failed',
    );
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

  // Seed the new account's identity wallet with testnet USDC (fire-and-forget,
  // testnet-only) so it's spendable right away without a faucet hunt.
  void dripTestnetUsdc(identity.address);

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
    logger.warn(
      {
        err: (err as Error).message,
        email: body.email,
        expectedRPID: rpID,
        expectedOrigins: origin,
        clientDataJSON: response?.response?.clientDataJSON,
      },
      'login verify failed',
    );
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

/// Issues a one-time 6-digit code for the email. Routes through Resend when
/// RESEND_API_KEY is set; otherwise logs to the backend terminal as a dev
/// convenience. Works for both new and returning users. The verify step
/// decides whether to create the account or log in.
authRoutes.post('/otp/request', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: 'otp-request' }), async (c) => {
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
  let delivered = false;
  try {
    const r = await sendOtpEmail(body.email, code);
    delivered = r.delivered;
  } catch (err) {
    logger.warn({ err: (err as Error).message, email: body.email }, 'otp send failed');
    // Keep going. The user can retry; the code is already stored either way.
    // Detailed reason stays on the server log; do not leak it to the client.
  }
  return c.json({
    sent: true,
    delivered,
    // Surface the code in the response only when (a) we're in dev and (b)
    // the send path didn't actually deliver email, typically because no
    // RESEND_API_KEY is configured. Production stays mute regardless.
    ...(isDev() && !delivered ? { devCode: code } : {}),
  });
});

const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'code must be 6 digits'),
});

authRoutes.post('/otp/verify', rateLimit({ windowMs: 10 * 60 * 1000, max: 15, name: 'otp-verify' }), async (c) => {
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
      // OTP signup: no passkey credential. The row is valid on email + address;
      // the user can register a passkey later, which appends a real credential.
      user = createUser({
        email: body.email,
        address: identity.address,
        circleIdentityWalletId: identity.walletId,
      });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, email: body.email },
        'createUser failed during OTP signup',
      );
      return c.json({ error: 'account creation failed; please retry' }, 500);
    }
    // Seed the new account's identity wallet with testnet USDC (fire-and-forget,
    // testnet-only) so it's spendable right away without a faucet hunt.
    void dripTestnetUsdc(identity.address);
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
