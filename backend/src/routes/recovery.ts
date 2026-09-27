/// Passkey recovery for mainnet wallets (mounted only when RECOVERY_ENABLED).
///
/// The browser locks a recovery key with the user's password; the server seals
/// that locked copy again (KMS) and never sees the password. Recovering needs
/// the email code, a proof of the password, and a 48-hour wait the owner can
/// cancel. Rules live in recovery/rules.ts; storage in db/recovery.ts.
///
///   POST /setup          session   store the backup once
///   POST /registered     session   record that recovery is on (ERC-1271 proof)
///   GET  /status         session   backup, on-chain, live request
///   GET  /own-backup     session   the backup for the owner's own unlock
///   POST /code/request   email     send a recovery code (always answers sent)
///   POST /code/verify    email     code -> 10-minute ticket
///   POST /state          ticket    the live request, ticket kept
///   POST /kdf            ticket    password parameters
///   POST /start          ticket    password proof -> 48-hour request
///   POST /cancel         session or cancel token
///   POST /release        ticket    after 48 hours, the locked backup, once
///   POST /completed      session   the recovered wallet closes the request

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Hex } from 'viem';
import { checkOtpAttempt, generateOtpCode, hashOtpCode, OTP_TTL_MS } from '../auth/otp.js';
import { sessionAddress } from '../auth/session.js';
import { config } from '../config.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { getModularAccountByAddress, getModularAccountByEmail } from '../db/modularAccounts.js';
import {
  failuresSince, getBackup, liveRequest, markRegistered, openRequest, recordAttempt, requestByCancelToken,
  saveBackup, saveCancelToken, setRequestState,
} from '../db/recovery.js';
import { sendRecoveryEmail, type RecoveryEmailKind } from '../emails/recovery.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { isRecoveryOwner } from '../recovery/onchain.js';
import { ATTEMPT_WINDOW_MS, MAX_ATTEMPTS, attemptGate, canCancel, canRelease } from '../recovery/rules.js';
import { sealer } from '../recovery/seal.js';
import { sendOtpEmail } from './auth.js';
import { invalidBodyMessage } from './invalidBody.js';

export const recoveryRoutes = new Hono();

type Mailer = (kind: RecoveryEmailKind, to: string, opts: { releasableAt?: number; cancelUrl?: string }) => Promise<void>;
// The recovery clock (48-hour wait, attempts). Codes and tickets are short-lived
// and always run on real time, like the rest of the OTP plumbing.
let clock = () => Date.now();
let session = (c: Context) => sessionAddress(c);
let ownerCheck = isRecoveryOwner;
let codeSink: ((code: string) => void) | null = null;
let mailer: Mailer = async (kind, to, opts) => {
  await sendRecoveryEmail(to, kind, opts);
};
export const __test = {
  setClock: (f: () => number) => { clock = f; },
  setSession: (f: () => string | null) => { session = () => f(); },
  setOwnerCheck: (f: typeof isRecoveryOwner) => { ownerCheck = f; },
  setCodeSink: (f: (code: string) => void) => { codeSink = f; },
  setMailer: (f: Mailer) => { mailer = f; },
};

const b64 = z.string().regex(/^[A-Za-z0-9_-]+$/).max(4096);
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const ticketSchema = z.object({ ticket: z.string().min(20).max(64) });
const kdfSchema = z.object({
  alg: z.literal('argon2id'),
  m: z.number().int().min(19456).max(262144),
  t: z.number().int().min(2).max(10),
  p: z.literal(1),
  salt: b64,
});
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
const toB64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = () => `recovery:${config.SESSION_SECRET ?? 'karwan-development-otp-secret-not-for-production'}`;
const TICKET_TTL_MS = 10 * 60 * 1000;
const cancelUrl = (token: string) => `${config.FRONTEND_BASE_URL ?? 'https://karwan.site'}/recover/cancel?token=${token}`;

interface PendingCode { codeHash: string; expiresAt: number; attempts: number }
interface Ticket { wallet: string; email: string; expiresAt: number }
const codes = durableEphemeralMap<PendingCode>('recovery-otp');
const tickets = durableEphemeralMap<Ticket>('recovery-ticket');

async function parse<T>(c: Context, schema: z.ZodType<T>): Promise<T | Response> {
  try {
    return schema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
}

function bad(c: Context, code: string, status: 400 | 401 | 404 | 409 | 429 = 400, extra: Record<string, unknown> = {}) {
  return c.json({ error: code, code, ...extra }, status);
}

function useTicket(id: string, consume: boolean): Ticket | null {
  const t = tickets.get(id);
  if (!t || t.expiresAt < Date.now()) return null;
  if (consume) tickets.delete(id);
  return t;
}

recoveryRoutes.post('/setup', async (c) => {
  const wallet = session(c);
  if (!wallet) return bad(c, 'unauthorized', 401);
  const body = await parse(c, z.object({ recoveryAddress: addr, kdf: kdfSchema, iv: b64, blob: b64, verifier: b64 }));
  if (body instanceof Response) return body;
  const account = await getModularAccountByAddress(wallet);
  if (!account) return bad(c, 'not_passkey_account');
  const s = sealer();
  const result = await saveBackup({
    walletAddress: wallet,
    emailHash: sha(account.email),
    recoveryAddress: body.recoveryAddress,
    kdf: body.kdf,
    iv: body.iv,
    sealedBlob: await s.seal(fromB64(body.blob), { walletAddress: wallet, purpose: 'blob' }),
    sealedVerifier: await s.seal(fromB64(body.verifier), { walletAddress: wallet, purpose: 'verifier' }),
    createdAt: clock(),
    registeredAt: null,
  });
  return result === 'created' ? c.json({ saved: true }) : bad(c, 'exists', 409);
});

recoveryRoutes.post('/registered', async (c) => {
  const wallet = session(c);
  if (!wallet) return bad(c, 'unauthorized', 401);
  const body = await parse(c, z.object({ message: z.string().min(1).max(200), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(20000) }));
  if (body instanceof Response) return body;
  if (!(await getBackup(wallet))) return bad(c, 'no_backup');
  if (!(await ownerCheck(wallet as Hex, body.message, body.signature as Hex))) return bad(c, 'not_owner');
  await markRegistered(wallet, clock());
  return c.json({ registered: true });
});

recoveryRoutes.get('/status', async (c) => {
  const wallet = session(c);
  if (!wallet) return bad(c, 'unauthorized', 401);
  const [backup, request] = await Promise.all([getBackup(wallet), liveRequest(wallet)]);
  return c.json({
    backup: !!backup,
    onchain: !!backup?.registeredAt,
    request: request ? { state: request.state, releasableAt: request.releasableAt } : null,
  });
});

/// The session is the passkey, so handing its owner the locked backup reveals
/// nothing they could not already do; they still need the password to open it.
recoveryRoutes.get('/own-backup', async (c) => {
  const wallet = session(c);
  if (!wallet) return bad(c, 'unauthorized', 401);
  const backup = await getBackup(wallet);
  if (!backup) return bad(c, 'no_backup', 404);
  const blob = await sealer().open(backup.sealedBlob, { walletAddress: wallet, purpose: 'blob' });
  return c.json({ kdf: backup.kdf, iv: backup.iv, blob: toB64(blob), recoveryAddress: backup.recoveryAddress });
});

recoveryRoutes.post('/code/request', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: 'recovery-code' }), async (c) => {
  const body = await parse(c, z.object({ email: emailSchema }));
  if (body instanceof Response) return body;
  // Same answer whether or not the email has an account, so nobody can probe for one.
  const account = await getModularAccountByEmail(body.email);
  if (account) {
    const code = generateOtpCode();
    codes.set(body.email, { codeHash: hashOtpCode(code, body.email, secret()), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    if (codeSink) codeSink(code);
    else await sendOtpEmail(body.email, code, 'recovery').catch(() => undefined);
  }
  return c.json({ sent: true });
});

recoveryRoutes.post('/code/verify', rateLimit({ windowMs: 10 * 60 * 1000, max: 15, name: 'recovery-verify' }), async (c) => {
  const body = await parse(c, z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/) }));
  if (body instanceof Response) return body;
  const entry = codes.get(body.email);
  if (!entry) return bad(c, 'no_code');
  const result = checkOtpAttempt(entry, body.code, body.email, secret());
  if (result.status === 'expired' || result.status === 'locked') {
    codes.delete(body.email);
    return bad(c, 'code_expired');
  }
  if (result.status === 'wrong') {
    codes.set(body.email, { ...entry, attempts: result.attempts });
    return bad(c, 'wrong_code');
  }
  codes.delete(body.email);
  const account = await getModularAccountByEmail(body.email);
  if (!account) return bad(c, 'no_code');
  const id = randomBytes(24).toString('base64url');
  tickets.set(id, { wallet: account.address.toLowerCase(), email: body.email, expiresAt: Date.now() + TICKET_TTL_MS });
  return c.json({ ticket: id });
});

recoveryRoutes.post('/state', async (c) => {
  const body = await parse(c, ticketSchema);
  if (body instanceof Response) return body;
  const t = useTicket(body.ticket, false);
  if (!t) return bad(c, 'ticket_expired');
  const request = await liveRequest(t.wallet);
  return c.json({ request: request ? { state: request.state, releasableAt: request.releasableAt } : null });
});

recoveryRoutes.post('/kdf', async (c) => {
  const body = await parse(c, ticketSchema);
  if (body instanceof Response) return body;
  const t = useTicket(body.ticket, false);
  if (!t) return bad(c, 'ticket_expired');
  const backup = await getBackup(t.wallet);
  if (!backup) return bad(c, 'no_backup');
  if (!backup.registeredAt) return bad(c, 'not_registered');
  return c.json({ kdf: backup.kdf });
});

recoveryRoutes.post('/start', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, name: 'recovery-start' }), async (c) => {
  const body = await parse(c, z.object({ ticket: z.string().min(20).max(64), verifier: b64 }));
  if (body instanceof Response) return body;
  const t = useTicket(body.ticket, true);
  if (!t) return bad(c, 'ticket_expired');
  const backup = await getBackup(t.wallet);
  if (!backup) return bad(c, 'no_backup');
  if (!backup.registeredAt) return bad(c, 'not_registered');
  const now = clock();
  const gate = attemptGate(await failuresSince(t.wallet, now - 2 * ATTEMPT_WINDOW_MS), now);
  if (!gate.allowed) return bad(c, 'locked', 429, { retryAt: gate.retryAt });
  const stored = await sealer().open(backup.sealedVerifier, { walletAddress: t.wallet, purpose: 'verifier' });
  const given = fromB64(body.verifier);
  const ok = given.length === stored.length && timingSafeEqual(given, stored);
  await recordAttempt(t.wallet, now, ok);
  if (!ok) {
    const recent = (await failuresSince(t.wallet, now - ATTEMPT_WINDOW_MS)).length;
    return bad(c, 'wrong_password', 400, { remaining: Math.max(0, MAX_ATTEMPTS - recent) });
  }
  const { request, created } = await openRequest(t.wallet, now);
  if (created) {
    const token = randomBytes(24).toString('base64url');
    await saveCancelToken(request.id, sha(token));
    await mailer('started', t.email, { releasableAt: request.releasableAt, cancelUrl: cancelUrl(token) });
  }
  return c.json({ state: request.state, releasableAt: request.releasableAt, created });
});

recoveryRoutes.post('/cancel', rateLimit({ windowMs: 10 * 60 * 1000, max: 20, name: 'recovery-cancel' }), async (c) => {
  const body = await parse(c, z.object({ token: z.string().min(20).max(64).optional() }));
  if (body instanceof Response) return body;
  const wallet = session(c);
  const request = body.token ? await requestByCancelToken(sha(body.token)) : wallet ? await liveRequest(wallet) : null;
  if (!request || !canCancel(request)) return bad(c, 'nothing_to_cancel');
  await setRequestState(request.id, { state: 'cancelled', cancelledAt: clock() });
  const account = await getModularAccountByAddress(request.walletAddress);
  if (account) await mailer('cancelled', account.email, {});
  return c.json({ cancelled: true });
});

recoveryRoutes.post('/release', async (c) => {
  const body = await parse(c, ticketSchema);
  if (body instanceof Response) return body;
  const t = useTicket(body.ticket, true);
  if (!t) return bad(c, 'ticket_expired');
  const request = await liveRequest(t.wallet);
  if (!request) return bad(c, 'not_waiting');
  const gate = canRelease(request, clock());
  if (!gate.ok) return bad(c, gate.reason, 400, gate.reason === 'too_early' ? { releasableAt: request.releasableAt } : {});
  const backup = await getBackup(t.wallet);
  if (!backup) return bad(c, 'no_backup');
  const blob = await sealer().open(backup.sealedBlob, { walletAddress: t.wallet, purpose: 'blob' });
  if (request.state === 'waiting') {
    await setRequestState(request.id, { state: 'released', releasedAt: clock() });
    await mailer('released', t.email, {});
  }
  return c.json({ kdf: backup.kdf, iv: backup.iv, blob: toB64(blob), recoveryAddress: backup.recoveryAddress, walletAddress: t.wallet });
});

recoveryRoutes.post('/completed', async (c) => {
  const wallet = session(c);
  if (!wallet) return bad(c, 'unauthorized', 401);
  const request = await liveRequest(wallet);
  if (!request || request.state !== 'released') return bad(c, 'not_released');
  await setRequestState(request.id, { state: 'completed', completedAt: clock() });
  const account = await getModularAccountByAddress(wallet);
  if (account) await mailer('completed', account.email, {});
  return c.json({ completed: true });
});
