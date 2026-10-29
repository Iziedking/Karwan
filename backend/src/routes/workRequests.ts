import { Hono } from 'hono';
import { z } from 'zod';
import type { Address } from 'viem';
import type { WorkRequests } from '../work/workRequests.js';

/// Hourly work posted to the market (view 32). Anyone sees what is open; the
/// hirer sees the offers ranked by their agent; a seller sees their own offer.

export interface WorkRequestRouteDeps {
  core: WorkRequests;
  session(c: unknown): { address: string } | null;
}

const postSchema = z.object({
  kind: z.enum(['hourly', 'monthly']),
  title: z.string().max(200),
  brief: z.string().max(4_000),
  maxRateUsdc: z.string().max(32),
  maxHours: z.number().int().optional(),
  periods: z.number().int(),
  startsInDays: z.number().int().optional(),
});
const offerSchema = z.object({ rateUsdc: z.string().max(32), note: z.string().max(300).optional() });
const pickSchema = z.object({ offerId: z.string().min(3).max(64) });

const INPUT_CODES = new Set(['BAD_TERMS']);
function refused(r: { code: string; message: string; needMicros?: string }) {
  const status = r.code === 'NOT_FOUND' ? 404 : INPUT_CODES.has(r.code) ? 400 : 409;
  return { status: status as 400 | 404 | 409, body: { error: r.message, code: r.code, ...(r.needMicros ? { needMicros: r.needMicros } : {}) } };
}

type Out = { ok: true } | { ok: false; code: string; message: string; needMicros?: string };

export function createWorkRequestRoutes(deps: WorkRequestRouteDeps) {
  const app = new Hono();
  const who = (c: unknown) => deps.session(c)?.address as Address | undefined;
  const fail = (c: { json: (b: unknown, s?: number) => Response }, out: Out) => {
    const r = refused(out as Exclude<Out, { ok: true }>);
    return c.json(r.body, r.status);
  };

  app.get('/', async (c) => c.json({ requests: await deps.core.listOpen() }));

  app.get('/mine', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    return c.json({ requests: await deps.core.mine(me) });
  });

  app.post('/', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = postSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const out = await deps.core.post(me, body.data);
    if (!out.ok) return fail(c, out);
    return c.json({ request: await deps.core.view(out.request.id, me) });
  });

  app.get('/:id', async (c) => {
    const v = await deps.core.view(c.req.param('id'), who(c) ?? null);
    return v ? c.json({ request: v }) : c.json({ error: 'not found' }, 404);
  });

  app.post('/:id/offers', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = offerSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const id = c.req.param('id');
    const out = await deps.core.offer(me, id, body.data);
    if (!out.ok) return fail(c, out);
    return c.json({ request: await deps.core.view(id, me) });
  });

  app.post('/:id/offers/withdraw', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const id = c.req.param('id');
    const out = await deps.core.withdraw(me, id);
    if (!out.ok) return fail(c, out);
    return c.json({ request: await deps.core.view(id, me) });
  });

  app.post('/:id/hire/card', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = pickSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const out = await deps.core.hireCard(me, c.req.param('id'), body.data.offerId);
    if (!out.ok) return fail(c, out);
    return c.json({ card: out.card });
  });

  app.post('/:id/hire', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = pickSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const out = await deps.core.hire(me, c.req.param('id'), body.data.offerId);
    if (!out.ok) return fail(c, out);
    return c.json({ workId: out.work.id });
  });

  app.post('/:id/close', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const id = c.req.param('id');
    const out = await deps.core.close(me, id);
    if (!out.ok) return fail(c, out);
    return c.json({ request: await deps.core.view(id, me) });
  });

  return app;
}
