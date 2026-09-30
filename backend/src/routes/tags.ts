/// Karwan tag lookup for sending money.
///
///   GET /api/tags/:tag   who does @tag pay?
///
/// Signed in only and rate limited, so the tag directory cannot be crawled for
/// addresses. The sheet pays the address returned at the moment of confirming.

import { Hono } from 'hono';
import { readSession } from '../auth/session.js';
import { findProfileByHandle } from '../db/profiles.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { checkKarwanTag } from '../profile/karwanTag.js';
import { tagRecipient } from '../profile/tagRecipient.js';

export const tagRoutes = new Hono();

tagRoutes.get('/:tag', rateLimit({ windowMs: 60_000, max: 30, name: 'tag-lookup' }), async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'Sign in first.', code: 'not_signed_in' }, 401);
  const raw = c.req.param('tag') ?? '';
  const check = checkKarwanTag(raw);
  if (!check.ok) return c.json({ found: false, tag: raw });
  const profile = await findProfileByHandle(check.tag);
  return c.json(tagRecipient(check.tag, profile, session.address));
});
