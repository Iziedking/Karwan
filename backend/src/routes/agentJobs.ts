import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { isRefusal, type AgentJobs } from '../agentJobs/agentJobs.js';

/// Outside-agent jobs on the web (views 15 and 40): the person's pairing and
/// release pages, which need no Karwan account, and the seller's own page.

export interface AgentJobRouteDeps {
  core: AgentJobs;
  session(c: unknown): { address: string } | null;
}

const STATUS: Record<string, ContentfulStatusCode> = {
  NOT_YOURS: 404, TOKEN_USED: 410, WRONG_PERSON: 403, WRONG_STATE: 409, BUSY: 409, LATE: 409, BAD_NOTE: 400,
  WORLD_ID_UNAVAILABLE: 503, WORLD_ID_RESPONSE_INVALID: 400, WORLD_ID_PROOF_REJECTED: 403, PAIRED_ELSEWHERE: 409,
};

const reply = (c: Context, body: Record<string, unknown>) => {
  c.header('Cache-Control', 'no-store');
  if (isRefusal(body)) return c.json({ error: body.message, code: body.code }, STATUS[body.code] ?? 409);
  return c.json(body);
};

const token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
const ref = z.string().regex(/^aj_[0-9a-f]{16}$/);
const proof = z.record(z.string(), z.unknown());

export function createAgentJobRoutes(deps: AgentJobRouteDeps) {
  const app = new Hono();
  const who = (c: unknown) => deps.session(c)?.address;
  const bad = (c: Context) => c.json({ error: 'That link or request is not valid.' }, 400);

  // The person behind the agent: pair once, then answer each release link.
  app.get('/pair/:token', async (c) => {
    const t = token.safeParse(c.req.param('token'));
    return t.success ? reply(c, await deps.core.pairView(t.data)) : bad(c);
  });
  app.post('/pair/:token', async (c) => {
    const t = token.safeParse(c.req.param('token'));
    const body = z.object({ result: proof }).safeParse(await c.req.json().catch(() => null));
    return t.success && body.success ? reply(c, await deps.core.pair(t.data, body.data.result)) : bad(c);
  });
  app.get('/release/:token', async (c) => {
    const t = token.safeParse(c.req.param('token'));
    return t.success ? reply(c, await deps.core.releaseView(t.data)) : bad(c);
  });
  app.post('/release/:token/check', async (c) => {
    const t = token.safeParse(c.req.param('token'));
    return t.success ? reply(c, await deps.core.releaseCheck(t.data)) : bad(c);
  });
  app.post('/release/:token', async (c) => {
    const t = token.safeParse(c.req.param('token'));
    const body = z.object({ result: proof, happy: z.boolean(), note: z.string().max(300).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!t.success || !body.success) return bad(c);
    return reply(c, await deps.core.answer(t.data, body.data.result, { happy: body.data.happy, note: body.data.note }));
  });

  // The seller.
  app.get('/mine', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    return reply(c, { ok: true, jobs: await deps.core.sellerJobs(me) });
  });
  app.get('/:ref', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const r = ref.safeParse(c.req.param('ref'));
    return r.success ? reply(c, await deps.core.sellerJobView(me, r.data)) : bad(c);
  });
  app.post('/:ref/delivered', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const r = ref.safeParse(c.req.param('ref'));
    const body = z.object({ note: z.string().max(1000) }).safeParse(await c.req.json().catch(() => null));
    return r.success && body.success ? reply(c, await deps.core.markDelivered(me, r.data, body.data.note)) : bad(c);
  });
  app.post('/:ref/dispute', async (c) => {
    const me = who(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const r = ref.safeParse(c.req.param('ref'));
    const body = z.object({ clause: z.string().max(1000) }).safeParse(await c.req.json().catch(() => null));
    return r.success && body.success ? reply(c, await deps.core.sellerDispute(me, r.data, body.data.clause)) : bad(c);
  });
  return app;
}
