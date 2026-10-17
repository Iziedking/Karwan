import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { conversationView, inboxView, type MessageToolDeps } from '../assistant/messageTools.js';

/// The site's view of messaging someone by tag. It sends through the same
/// function as the assistant tool, so the pause and the warning match.

export interface DirectMessageRouteDeps extends MessageToolDeps {
  viewer: (c: Context) => string | null;
}

const Body = z.object({ body: z.string().min(1).max(2000) });

export function createDirectMessageRoutes(deps: DirectMessageRouteDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const me = deps.viewer(c);
    if (!me) return c.json({ error: 'Sign in to read your messages.' }, 401);
    return c.json({ conversations: inboxView(await deps.inbox(me)) });
  });

  app.get('/:tag', async (c) => {
    const me = deps.viewer(c);
    if (!me) return c.json({ error: 'Sign in to read your messages.' }, 401);
    const tag = c.req.param('tag');
    const who = await deps.describe(tag);
    if (!who) return c.json({ error: 'No one on Karwan has that tag.' }, 404);
    return c.json(conversationView(me, who, await deps.list(me, tag)));
  });

  app.post('/:tag', async (c) => {
    const me = deps.viewer(c);
    if (!me) return c.json({ error: 'Sign in to send a message.' }, 401);
    const parsed = Body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Write a message first.' }, 400);
    const r = await deps.send(me, c.req.param('tag'), parsed.data.body);
    if (!r.ok) return c.json({ error: r.message, code: r.code, ...(r.until ? { until: r.until } : {}) }, 400);
    return c.json({ sent: true, warning: r.warning });
  });

  return app;
}
