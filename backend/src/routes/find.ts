import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import { block, unblock } from '../find/blocks.js';
import { getProfile } from '../db/profiles.js';
import { answerPitch, declineAlert } from '../find/answers.js';
import { contactOf, contactsOfFind, pitchesTo } from '../find/contacts.js';
import { livePitchDeps } from '../find/alertsLive.js';
import { pitchPicked } from '../find/pitches.js';
import { pitchView } from '../find/pitchView.js';
import { findOf, myFinds, ownerView, type Find } from '../find/finds.js';
import { MAX_NEEDS, NEED_TEXT_MAX, needsOf, removeNeed, saveNeed, TooManyNeeds, type StandingNeed } from '../find/needs.js';
import { invalidBodyMessage } from './invalidBody.js';

/// Finds, being reached and blocks (view 72): a person's finds, standing needs
/// and who they stopped. Every route acts only for the signed-in person.

export const findRoutes = new Hono();

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const needBody = z.object({
  /// Present to change a need they already have.
  id: z.string().min(1).max(80).optional(),
  what: z.string().trim().min(3).max(NEED_TEXT_MAX),
  every: z.enum(['once', 'week', 'month', 'season']),
  budgetUsdc: z.number().positive().max(10_000_000).nullable().optional(),
  kind: z.enum(['goods', 'in_person', 'remote']),
  paused: z.boolean().optional(),
});

findRoutes.get('/needs', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  return c.json({ needs: await needsOf(me), max: MAX_NEEDS });
});

findRoutes.post('/needs', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  let body: z.infer<typeof needBody>;
  try {
    body = needBody.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const mine = await needsOf(me);
  const current = body.id ? mine.find((n) => n.id === body.id) : undefined;
  if (body.id && !current) return c.json({ error: 'need not found' }, 404);
  const need: StandingNeed = {
    id: current?.id ?? randomUUID(),
    owner: me,
    what: body.what,
    every: body.every,
    budgetUsdc: body.budgetUsdc != null ? String(Math.round(body.budgetUsdc * 1e6) / 1e6) : null,
    currency: current?.currency ?? null,
    kind: body.kind,
    paused: body.paused ?? current?.paused ?? false,
    createdAt: current?.createdAt ?? Date.now(),
  };
  try {
    return c.json({ need: await saveNeed(need) });
  } catch (err) {
    if (err instanceof TooManyNeeds) return c.json({ error: `You can keep up to ${MAX_NEEDS} needs. Remove one first.` }, 409);
    throw err;
  }
});

findRoutes.delete('/needs/:id', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  const removed = await removeNeed(me, c.req.param('id'));
  return removed ? c.json({ ok: true }) : c.json({ error: 'need not found' }, 404);
});

const whoBody = z.object({ who: z.string().regex(ADDRESS) });

async function blockStep(c: Context, act: (owner: string, other: string) => Promise<void>) {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  let body: z.infer<typeof whoBody>;
  try {
    body = whoBody.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (body.who.toLowerCase() === me.toLowerCase()) return c.json({ error: 'that is you' }, 400);
  await act(me, body.who);
  return c.json({ ok: true });
}

findRoutes.post('/block', (c) => blockStep(c, block));
findRoutes.post('/unblock', (c) => blockStep(c, unblock));

/// A person's own finds. Anyone else's find is not found, never forbidden.
findRoutes.get('/finds', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  return c.json({ finds: (await myFinds(me)).map((f) => ownerView(f)) });
});

/// Each person's photo, read now so a changed photo shows at once.
async function photosOf(f: Find): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(f.rows.map(async (r) => {
    const p = await getProfile(r.user).catch(() => null);
    const photo = (p?.profileImageDataUrl || p?.xProfileImageUrl)?.trim();
    if (photo) out.set(r.user.toLowerCase(), photo);
  }));
  return out;
}

findRoutes.get('/finds/:id', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  const found = await findOf(me, c.req.param('id'));
  if (!found) return c.json({ error: 'find not found' }, 404);
  const contacts = await contactsOfFind(found.id);
  const asked = new Map(contacts.filter((x) => x.kind === 'alert').map((x) => [x.to, { answer: x.answer, nextAt: x.answer === null && x.closedAt === null ? x.nextAt : null, closed: x.closedAt !== null }]));
  const pitched = new Set(contacts.filter((x) => x.kind === 'pitch' && x.needId).map((x) => x.needId!));
  return c.json({ find: ownerView(found, await photosOf(found), asked, pitched) });
});

/// A seller says no thanks to a deal alert (view 72). Yes is an offer on the request.
findRoutes.post('/alerts/:jobId/no', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  const r = await declineAlert(me, c.req.param('jobId'), Date.now());
  return r === 'none' ? c.json({ error: 'no deal alert on that request' }, 404) : c.json({ ok: true, state: r });
});

export const pitchBody = z.object({
  findId: z.string().uuid(),
  picks: z.array(z.number().int().min(0).max(4)).min(1).max(5),
  priceUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/),
  days: z.number().int().min(1).max(90),
  note: z.string().trim().max(280).default(''),
});

/// A seller pitches the needs they picked from their own find (view 72, Phase 4).
findRoutes.post('/pitches', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  let body: z.infer<typeof pitchBody>;
  try {
    body = pitchBody.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!(Number(body.priceUsdc) > 0)) return c.json({ error: 'Say a price.' }, 400);
  const find = await findOf(me, body.findId);
  if (!find || find.side !== 'seller' || find.status === 'ended') return c.json({ error: 'find not found' }, 404);
  const out = await pitchPicked({ find, picks: body.picks, offer: { priceUsdc: body.priceUsdc, days: body.days, note: body.note } }, Date.now(), livePitchDeps);
  return c.json(out);
});

/// Pitches sent to this buyer, newest first.
findRoutes.get('/pitches', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  return c.json({ pitches: await Promise.all((await pitchesTo(me)).map(pitchView)) });
});

/// One pitch, only for the buyer it went to.
findRoutes.get('/pitches/:id', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  const p = await contactOf(c.req.param('id'));
  if (!p || p.kind !== 'pitch' || p.to !== me.toLowerCase() || !p.delivered) return c.json({ error: 'pitch not found' }, 404);
  return c.json({ pitch: await pitchView(p) });
});

/// Not now or not interested. Interested posts the request (POST /api/jobs with the pitch).
findRoutes.post('/pitches/:id/answer', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  let body: { answer: 'not_now' | 'no' };
  try {
    body = z.object({ answer: z.enum(['not_now', 'no']) }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const r = await answerPitch(me, c.req.param('id'), body.answer, Date.now());
  if (r === 'none') return c.json({ error: 'pitch not found' }, 404);
  return c.json({ ok: true, state: r });
});
