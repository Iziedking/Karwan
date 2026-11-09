import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import { block, unblock } from '../find/blocks.js';
import { findOf, myFinds, ownerView } from '../find/finds.js';
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
  return c.json({ finds: (await myFinds(me)).map(ownerView) });
});

findRoutes.get('/finds/:id', async (c) => {
  const me = sessionAddress(c);
  if (!me) return c.json({ error: 'not authenticated' }, 401);
  const found = await findOf(me, c.req.param('id'));
  return found ? c.json({ find: ownerView(found) }) : c.json({ error: 'find not found' }, 404);
});
