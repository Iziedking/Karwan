import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { viewerAddress } from '../auth/session.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { caseStore, type SupportCase } from '../support/cases.js';
import { openOrJoinCase, tellTeam } from '../support/openCase.js';

/// A person's own cases (view 78), mounted at /api/support/cases. Signed in
/// only: a person opens a case, lists theirs, reads one and writes more.
/// Team notes and held replies never leave the desk.
export const supportCasesRoutes = new Hono();

const recordSchema = z.object({ kind: z.enum(['deal', 'transfer']), id: z.string().min(4).max(100) });
const openSchema = z.object({ text: z.string().trim().min(1).max(4000), records: z.array(recordSchema).max(3).default([]) });
const writeSchema = z.object({ text: z.string().trim().min(1).max(4000) });

/// What the person may read about their own case.
function forPerson(c: SupportCase) {
  return { ref: c.ref, kind: c.kind, state: c.state, dueAt: c.dueAt, records: c.records, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

async function mine(c: Context): Promise<SupportCase | null> {
  const me = viewerAddress(c)?.toLowerCase();
  if (!me) return null;
  const k = await caseStore().get(c.req.param('ref') ?? '');
  return k && k.address === me ? k : null;
}

supportCasesRoutes.post(
  '/',
  rateLimit({ windowMs: 30 * 60 * 1000, max: 5, name: 'support-case-open' }),
  async (c) => {
    const me = viewerAddress(c)?.toLowerCase();
    if (!me) return c.json({ error: 'Sign in to open a case.' }, 401);
    let body;
    try {
      body = openSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: 'Say what happened.' }, 400);
    }
    const r = await openOrJoinCase({ address: me, text: body.text, records: body.records, channel: 'web' });
    if (!r.ok) return c.json({ error: 'That record is not yours.' }, 403);
    return c.json({ ref: r.ref, joined: r.joined, dueAt: r.dueAt, outOfHours: r.outOfHours });
  },
);

supportCasesRoutes.get('/', async (c) => {
  const me = viewerAddress(c)?.toLowerCase();
  if (!me) return c.json({ error: 'Sign in to see your cases.' }, 401);
  const store = caseStore();
  const cases = await Promise.all(
    (await store.forPerson(me)).map(async (k) => {
      const seen = await store.messages(k.id, { forPerson: true });
      return { ...forPerson(k), lastLine: (seen[seen.length - 1]?.text ?? '').slice(0, 160) };
    }),
  );
  return c.json({ cases });
});

supportCasesRoutes.get('/:ref', async (c) => {
  const k = await mine(c);
  if (!k) return c.json({ error: 'not-found' }, 404);
  const messages = (await caseStore().messages(k.id, { forPerson: true })).map((m) => ({ role: m.role, text: m.text, at: m.at, channel: m.channel }));
  return c.json({ case: forPerson(k), messages });
});

supportCasesRoutes.post(
  '/:ref/messages',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, name: 'support-case-write' }),
  async (c) => {
    const k = await mine(c);
    if (!k) return c.json({ error: 'not-found' }, 404);
    let body;
    try {
      body = writeSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: 'Write something first.' }, 400);
    }
    await caseStore().add(k.id, { role: 'person', channel: 'web', text: body.text, at: Date.now() });
    void tellTeam(k.ref, body.text, false);
    return c.json({ ok: true });
  },
);
