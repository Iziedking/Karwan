import { Hono } from 'hono';
import { z } from 'zod';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resend } from 'resend';
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

// Lazy-init Resend so a misconfigured key only blows up if we actually try to
// send. Returning null keeps the dev path (log-only) working with zero setup.
let _resend: Resend | null | undefined;
function resendClient(): Resend | null {
  if (_resend !== undefined) return _resend;
  _resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;
  return _resend;
}

interface OtpSendResult {
  delivered: boolean;
  /// Surfaced when delivery failed so the modal can show a real message
  /// instead of a silent fallback to the dev pill. Empty string when the
  /// log-only path was the intended one (no provider configured).
  reason?: string;
}

// Brand mark loaded from disk once at boot. Sent to Resend as a CID inline
// attachment so the <img cid:karwan-logo> reference in the HTML resolves
// without needing a public image host. CID inline images render in Gmail
// (web + mobile), Apple Mail, Outlook, and Hey — the failure modes that hit
// raw inline SVG and data URIs.
function loadLogoBuffer(): Buffer | null {
  const candidates = [
    resolve(process.cwd(), 'docs/bot-assets/karwan-bot-pic.png'),
    resolve(process.cwd(), '../docs/bot-assets/karwan-bot-pic.png'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p);
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}
const LOGO_BUFFER = loadLogoBuffer();
const LOGO_CID = 'karwan-logo';

/// HTML body for the OTP email. Brand mark referenced via cid: so Resend
/// attaches the PNG inline. All accents are ink-on-cream — no lime — so the
/// email reads as a transactional notice, not a marketing piece.
function otpEmailHtml(code: string): string {
  // Space the digits so the code is easy to read at a glance even in clients
  // that crush letter-spacing. Doesn't affect copy-paste — recipients still
  // type the 6 digits into the modal.
  const spacedCode = code.split('').join('&nbsp;&nbsp;');
  // When the brand asset is missing, fall back to a wordmark-only header so
  // the email still ships with no broken-image icon.
  const logoCell = LOGO_BUFFER
    ? `<img src="cid:${LOGO_CID}" width="36" height="36" alt="Karwan" style="display:block;border-radius:6px;" />`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Karwan sign-in code</title>
</head>
<body style="margin:0;padding:0;background:#f3efe6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0e0e0e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3efe6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e6e2d8;border-radius:18px 18px 18px 5px;overflow:hidden;">
          <!-- Header: dark band with the Karwan brand mark + wordmark -->
          <tr>
            <td style="background:#0e0e0e;padding:24px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${
                    LOGO_BUFFER
                      ? `<td style="vertical-align:middle;padding-right:12px;">${logoCell}</td>`
                      : ''
                  }
                  <td style="vertical-align:middle;">
                    <div style="font-size:18px;font-weight:800;letter-spacing:0.04em;color:#ffffff;text-transform:uppercase;line-height:1;">Karwan</div>
                    <div style="margin-top:4px;font-size:10px;letter-spacing:0.18em;color:rgba(255,255,255,0.55);text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">SIGN-IN&nbsp;CODE</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Code block: oversized tabular nums on cream -->
          <tr>
            <td style="padding:36px 28px 12px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Your code</div>
              <div style="display:inline-block;padding:18px 28px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:14px 14px 14px 4px;">
                <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:38px;font-weight:800;letter-spacing:0.08em;color:#0e0e0e;line-height:1;">${spacedCode}</div>
              </div>
            </td>
          </tr>

          <!-- Expiration + safety -->
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

          <!-- Footer: muted note + brand strip -->
          <tr>
            <td style="padding:24px 28px 24px 28px;">
              <hr style="border:none;border-top:1px solid #e6e2d8;margin:0 0 16px 0;" />
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8478;">
                Didn't request this? Ignore the email. No account changes happen until a code is entered.
              </p>
              <p style="margin:14px 0 0 0;font-size:10px;letter-spacing:0.18em;color:#b8b0a0;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">
                Karwan&nbsp;&middot;&nbsp;Agentic settlement on Arc
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/// Sends the 6-digit code to the user. When RESEND_API_KEY is set we POST to
/// Resend; otherwise we log the code to the backend terminal so dev still
/// works without any provider configured. Returns whether the code went out
/// over real email — the dev autofill pill only renders when this is false.
async function sendOtpEmail(email: string, code: string): Promise<OtpSendResult> {
  const client = resendClient();
  if (!client) {
    logger.info({ email, code }, '[OTP] code (no RESEND_API_KEY, log-only)');
    return { delivered: false };
  }
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
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
      logger.info({ email, code }, '[OTP] code (resend rejected, log fallback)');
      return { delivered: false, reason: error.message };
    }
    logger.info({ email, id: data?.id }, 'OTP code emailed via resend');
    return { delivered: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    logger.warn({ err: message, email }, 'resend threw');
    logger.info({ email, code }, '[OTP] code (resend threw, log fallback)');
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
    hasPasskey: !!user && user.credentials.length > 0,
  });
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
/// convenience. Works for both new and returning users — the verify step
/// decides whether to create the account or log in.
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
    // the send path didn't actually deliver email — typically because no
    // RESEND_API_KEY is configured. Production stays mute regardless.
    ...(isDev() && !delivered ? { devCode: code } : {}),
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
