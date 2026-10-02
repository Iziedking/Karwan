import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import { invalidBodyMessage } from './invalidBody.js';
import { getProfile } from '../db/profiles.js';
import { acceptOffer, createOffer, defaultDeps, viewOffers, withdrawOffer, type OfferDeps } from '../offers/service.js';

/// A seller's own offer on a request. Identity is the signed session only.

let session: (c: Context) => string | null = (c) => sessionAddress(c);
let deps: OfferDeps = defaultDeps;

const offerSchema = z.object({
  priceUsdc: z.string().min(1).max(32),
  deliverByUnix: z.number().int().positive(),
  note: z.string().max(2000),
});

export const offersRoutes = new Hono();

offersRoutes.get('/:jobId/offers', async (c) => {
  const jobId = c.req.param('jobId');
  const view = await viewOffers(session(c), jobId, deps);
  const postedBy = deps.brief(jobId)?.postedBy;
  return c.json({ ...view, poster: postedBy ? await publicPoster(postedBy) : null });
});

/// Who posted a request, for a link to their public profile. Only when their
/// passport is public; someone who turned it off is not named here either.
async function publicPoster(address: string): Promise<{ address: string; name: string | null; handle: string | null } | null> {
  const profile = await getProfile(address.toLowerCase()).catch(() => null);
  if (!profile || profile.settings?.publicPassport === false) return null;
  return { address: address.toLowerCase(), name: profile.displayName ?? null, handle: profile.handle ?? null };
}

offersRoutes.post('/:jobId/offers', async (c) => {
  const me = session(c);
  if (!me) return c.json({ error: 'Sign in to make an offer.', code: 'sign_in' }, 401);
  let body;
  try {
    body = offerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err), code: 'bad_body' }, 400);
  }
  const r = await createOffer(me, c.req.param('jobId'), body, deps);
  if (!r.ok) return c.json({ error: r.message ?? r.code, code: r.code }, r.status);
  return c.json({ offer: r.offer }, r.created ? 201 : 200);
});

offersRoutes.post('/:jobId/offers/:offerId/withdraw', async (c) => {
  const me = session(c);
  if (!me) return c.json({ error: 'Sign in first.', code: 'sign_in' }, 401);
  const r = await withdrawOffer(me, c.req.param('offerId'));
  if (!r.ok) return c.json({ error: r.code, code: r.code }, r.status);
  return c.json({ ok: true });
});

offersRoutes.post('/:jobId/offers/:offerId/accept', async (c) => {
  const me = session(c);
  if (!me) return c.json({ error: 'Sign in first.', code: 'sign_in' }, 401);
  const r = await acceptOffer(me, c.req.param('offerId'), deps);
  if (!r.ok) return c.json({ error: r.message ?? r.code, code: r.code }, r.status);
  return c.json({ ok: true, txHash: r.txHash });
});

export const __test = {
  setSession(fn: (c: Context) => string | null) {
    session = fn;
  },
  setDeps(d: OfferDeps) {
    deps = d;
  },
};
