import { Hono } from 'hono';
import { z } from 'zod';
import type { Address } from 'viem';
import type { Engagements } from '../work/engagements.js';

/// Hourly work and monthly retainers (view 32). Only the hirer and the worker
/// see a piece of work; anyone else gets the same answer as for one that does
/// not exist.

export interface WorkRouteDeps {
  core: Engagements;
  session(c: unknown): { address: string } | null;
}

const inputSchema = z.object({
  worker: z.string().min(1).max(64),
  kind: z.enum(['hourly', 'monthly']),
  rateUsdc: z.string().max(32),
  maxHours: z.number().int().optional(),
  periods: z.number().int(),
  startsInDays: z.number().int().optional(),
  title: z.string().max(200),
  brief: z.string().max(4_000).default(''),
});
const hoursSchema = z.object({ minutes: z.number().int(), note: z.string().max(300).optional(), k: z.number().int().min(0).optional() });
const weekSchema = z.object({ k: z.number().int().min(0) });
const objectSchema = z.object({ k: z.number().int().min(0), minutes: z.number().int(), reason: z.string().max(500) });

const INPUT_CODES = new Set(['BAD_TERMS', 'BAD_HOURS', 'BAD_REASON', 'NO_WORKER']);
function refused(r: { code: string; message: string; needMicros?: string }) {
  const status = r.code === 'NOT_FOUND' || r.code === 'NOT_PARTY' ? 404 : INPUT_CODES.has(r.code) ? 400 : 409;
  return { status: status as 400 | 404 | 409, body: { error: r.message, code: r.code, ...(r.needMicros ? { needMicros: r.needMicros } : {}) } };
}

type Out = { ok: true; work?: unknown } | { ok: false; code: string; message: string; needMicros?: string };

export function createWorkRoutes(deps: WorkRouteDeps) {
  const app = new Hono();
  const who = (c: unknown) => deps.session(c)?.address as Address | undefined;
  const answer = async (c: { json: (b: unknown, s?: number) => Response }, viewer: Address, id: string, out: Out) => {
    if (!out.ok) {
      const r = refused(out);
      return c.json(r.body, r.status);
    }
    return c.json({ work: await deps.core.view(id, viewer), ...('paidMicros' in out ? { paidMicros: out.paidMicros } : {}) });
  };

  app.get('/mine', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    return c.json({ work: await deps.core.mine(me) });
  });

  app.post('/draft', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const d = await deps.core.draft(me, body.data);
    if (!d.ok) {
      const r = refused(d);
      return c.json(r.body, r.status);
    }
    return c.json({ card: d.card });
  });

  app.post('/', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const out = await deps.core.offer(me, body.data);
    if (!out.ok) {
      const r = refused(out);
      return c.json(r.body, r.status);
    }
    return c.json({ work: await deps.core.view(out.work.id, me) });
  });

  app.get('/:id', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const v = await deps.core.view(c.req.param('id'), me);
    return v ? c.json({ work: v }) : c.json({ error: 'not found' }, 404);
  });

  app.post('/:id/accept', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.accept(me, id)) as Out);
  });

  app.post('/:id/decline', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.decline(me, id)) as Out);
  });

  app.post('/:id/cancel', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.cancel(me, id)) as Out);
  });

  app.post('/:id/notice', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.giveNotice(me, id)) as Out);
  });

  app.post('/:id/fund', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.fundNext(me, id)) as Out);
  });

  app.post('/:id/hours', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = hoursSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.logHours(me, id, body.data)) as Out);
  });

  app.post('/:id/approve', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = weekSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.approveHours(me, id, body.data.k)) as Out);
  });

  app.post('/:id/object', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const body = objectSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const id = c.req.param('id');
    return answer(c, me, id, (await deps.core.objectHours(me, id, body.data)) as Out);
  });

  return app;
}
