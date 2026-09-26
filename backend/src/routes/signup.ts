/// Short sign-up and Karwan tags.
///
///   GET  /api/signup/tag?tag=ada   is this tag free for me?
///   POST /api/signup               { tag, accountKind } create my account
///   POST /api/signup/tag           { tag } add a tag to an account made before tags
///
/// Identity is always the signed session (email code, passkey or wallet); the
/// body never names an address.

import { Hono } from 'hono';
import { z } from 'zod';
import { ARC } from '../chain/client.js';
import { readSession } from '../auth/session.js';
import { claimTag, getProfile, setProfileEmail, tagAvailableFor, upsertProfile } from '../db/profiles.js';
import { getUserByAddress } from '../db/users.js';
import { isInvited } from '../db/waitlist.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { checkKarwanTag } from '../profile/karwanTag.js';
import { newAccountProfile, signupRefusal } from '../profile/signup.js';
import { logger } from '../logger.js';
import { invalidBodyMessage } from './invalidBody.js';

export const signupRoutes = new Hono();

const NO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

signupRoutes.get('/tag', rateLimit({ windowMs: 60_000, max: 60, name: 'signup-tag-check' }), async (c) => {
  const raw = c.req.query('tag') ?? '';
  const check = checkKarwanTag(raw);
  if (!check.ok) return c.json({ tag: raw, available: false, reason: check.reason });
  const address = readSession(c)?.address ?? NO_ADDRESS;
  const available = await tagAvailableFor(check.tag, address);
  return c.json({ tag: check.tag, available, ...(available ? {} : { reason: 'taken' }) });
});

const signupSchema = z.object({
  tag: z.string().min(1).max(40),
  accountKind: z.enum(['person', 'business']),
});

signupRoutes.post('/', rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'signup-create' }), async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'Sign in first.', code: 'not_signed_in' }, 401);
  let body;
  try {
    body = signupSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const address = session.address.toLowerCase();
  const check = checkKarwanTag(body.tag);
  const tag = check.ok ? check.tag : body.tag;
  const existing = await getProfile(address);
  const email = session.email ?? getUserByAddress(address)?.email;
  const refusal = signupRefusal({
    invited: !!email && (await isInvited(email)),
    tag: body.tag,
    accountKind: body.accountKind,
    network: ARC.testnet ? 'testnet' : 'mainnet',
    hasProfile: !!existing,
    tagAvailable: check.ok ? await tagAvailableFor(tag, address) : false,
  });
  if (refusal) return c.json({ error: refusal.code, code: refusal.code }, refusal.status);

  let profile;
  try {
    profile = await upsertProfile(newAccountProfile(address, tag, body.accountKind));
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ error: 'tag_taken', code: 'tag_taken' }, 409);
    throw err;
  }
  // The email proven at sign-in (email code, or the passkey's linked email)
  // becomes the verified contact email, so alerts work from the first deal.
  if (email) profile = (await setProfileEmail(address, email, true)) ?? profile;
  logger.info({ address, tag, accountKind: body.accountKind }, 'account created');
  return c.json({ profile }, 201);
});

signupRoutes.post('/tag', rateLimit({ windowMs: 10 * 60_000, max: 20, name: 'signup-tag-claim' }), async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'Sign in first.', code: 'not_signed_in' }, 401);
  let body;
  try {
    body = z.object({ tag: z.string().min(1).max(40) }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const check = checkKarwanTag(body.tag);
  if (!check.ok) return c.json({ error: check.reason, code: check.reason }, 400);
  const result = await claimTag(session.address, check.tag);
  switch (result.kind) {
    case 'claimed':
      return c.json({ profile: result.profile });
    case 'taken':
      return c.json({ error: 'tag_taken', code: 'tag_taken' }, 409);
    case 'already_set':
      return c.json({ error: 'tag_already_set', code: 'tag_already_set', tag: result.tag }, 409);
    case 'no_profile':
      return c.json({ error: 'no_account', code: 'no_account' }, 404);
  }
});
