/// Mainnet waitlist.
///
///   POST /api/waitlist/request  { email, locale }  emails a 6-digit code
///   POST /api/waitlist/verify   { email, code }    joins once the code is right
///   POST /api/waitlist/use-case { token, useCase } optional answer after joining
///
/// The code proves the email belongs to the person joining, so the list only
/// holds addresses we can reach on launch day.

import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { checkOtpAttempt, generateOtpCode, hashOtpCode, OTP_TTL_MS } from '../auth/otp.js';
import { config } from '../config.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { isInvited, joinWaitlist, setWaitlistUseCase, WAITLIST_USE_CASES, waitlistPosition } from '../db/waitlist.js';
import { sendWaitlistJoinedEmail } from '../emails/waitlistJoined.js';
import { logger } from '../logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendOtpEmail } from './auth.js';
import { invalidBodyMessage } from './invalidBody.js';

export const waitlistRoutes = new Hono();

interface PendingCode {
  codeHash: string;
  locale: string;
  expiresAt: number;
  attempts: number;
}

const codes = durableEphemeralMap<PendingCode>('waitlist-otp');
/// Proves the answer comes from the person who just verified this email.
const answerTokens = durableEphemeralMap<{ email: string; expiresAt: number }>('waitlist-answer');
const ANSWER_TTL_MS = 60 * 60 * 1000;

let codeSink: ((code: string) => void) | null = null;
export const __test = { setCodeSink: (f: (code: string) => void) => { codeSink = f; } };
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const LOCALES = ['en', 'ar', 'fr', 'hi', 'sw'] as const;

function secret(): string {
  return `waitlist:${config.SESSION_SECRET ?? 'karwan-development-otp-secret-not-for-production'}`;
}

waitlistRoutes.post('/request', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: 'waitlist-request' }), async (c) => {
  let body;
  try {
    body = z.object({ email: emailSchema, locale: z.enum(LOCALES).catch('en') }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const code = generateOtpCode();
  codes.set(body.email, {
    codeHash: hashOtpCode(code, body.email, secret()),
    locale: body.locale,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  if (codeSink) {
    codeSink(code);
    return c.json({ sent: true });
  }
  try {
    await sendOtpEmail(body.email, code, 'waitlist');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'waitlist code send failed');
  }
  return c.json({ sent: true });
});

waitlistRoutes.post('/verify', rateLimit({ windowMs: 10 * 60 * 1000, max: 15, name: 'waitlist-verify' }), async (c) => {
  let body;
  try {
    body = z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/) }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const entry = codes.get(body.email);
  if (!entry) return c.json({ error: 'no_code', code: 'no_code' }, 400);
  const result = checkOtpAttempt(entry, body.code, body.email, secret());
  if (result.status === 'expired' || result.status === 'locked') {
    codes.delete(body.email);
    return c.json({ error: 'code_expired', code: 'code_expired' }, 400);
  }
  if (result.status === 'wrong') {
    codes.set(body.email, { ...entry, attempts: result.attempts });
    return c.json({ error: 'wrong_code', code: 'wrong_code' }, 400);
  }
  codes.delete(body.email);
  const { entry: joined, created } = await joinWaitlist(body.email, entry.locale);
  const [invited, position] = await Promise.all([isInvited(body.email), waitlistPosition(body.email)]);
  if (created) {
    logger.info({ email: body.email }, 'joined mainnet waitlist');
    if (!invited && !codeSink) void sendWaitlistJoinedEmail(body.email, position);
  }
  const answerToken = randomBytes(24).toString('base64url');
  answerTokens.set(answerToken, { email: body.email, expiresAt: Date.now() + ANSWER_TTL_MS });
  return c.json({ joined: true, alreadyJoined: !created, joinedAt: joined.joinedAt, invited, position, answerToken });
});

waitlistRoutes.post('/use-case', rateLimit({ windowMs: 10 * 60 * 1000, max: 20, name: 'waitlist-use-case' }), async (c) => {
  let body;
  try {
    body = z.object({ token: z.string().min(20).max(64), useCase: z.enum(WAITLIST_USE_CASES) }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const entry = answerTokens.get(body.token);
  if (!entry || entry.expiresAt < Date.now()) return c.json({ error: 'token_expired', code: 'token_expired' }, 400);
  await setWaitlistUseCase(entry.email, body.useCase);
  return c.json({ saved: true });
});
