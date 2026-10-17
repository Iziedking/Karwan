import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { RatingToolDeps } from '../assistant/ratingTools.js';

/// The deal page's rating card. It rates through the same function as the
/// assistant tool.

export interface RatingRouteDeps extends RatingToolDeps {
  viewer: (c: Context) => string | null;
}

const Body = z.object({
  stars: z.number().int().min(1).max(5),
  note: z.string().max(280).optional(),
});

export function createRatingRoutes(deps: RatingRouteDeps): Hono {
  const app = new Hono();

  app.get('/:id/rating', async (c) => {
    const me = deps.viewer(c);
    if (!me) return c.json({ error: 'Sign in to rate this deal.' }, 401);
    return c.json({ rated: await deps.hasRated(me, c.req.param('id')) });
  });

  app.post('/:id/rating', async (c) => {
    const me = deps.viewer(c);
    if (!me) return c.json({ error: 'Sign in to rate this deal.' }, 401);
    const parsed = Body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Rate it from 1 to 5.' }, 400);
    const r = await deps.rateDeal(me, c.req.param('id'), parsed.data.stars, parsed.data.note);
    if (!r.ok) return c.json({ error: r.message }, 400);
    return c.json({ saved: true, revealed: r.revealed, message: r.message });
  });

  return app;
}
