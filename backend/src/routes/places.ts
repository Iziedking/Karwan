import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { nearestTown, searchTowns, type Town } from '../location/places.js';

/// Towns to pick from as a person types, and the town nearest the position
/// their phone shares (view 39, 19 Nov). Both answer from Karwan's own list;
/// a position is used for this one answer and never logged or sent on.

export interface PlacesRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  towns: () => Town[] | Promise<Town[]>;
  now: () => number;
  log: (line: string) => void;
}

const MINUTE_MS = 60_000;
const SEARCH_PER_MINUTE = 30;
const NEAR_PER_MINUTE = 10;

const searchSchema = z.object({ country: z.string().trim().regex(/^[A-Za-z]{2}$/), q: z.string().max(80).optional() });
const pointSchema = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });

export function createPlacesRoutes(deps: PlacesRouteDeps): Hono {
  const app = new Hono();
  const used = new Map<string, { count: number; resetAt: number }>();

  function allowed(key: string, max: number): boolean {
    const now = deps.now();
    const bucket = used.get(key);
    if (!bucket || bucket.resetAt <= now) {
      used.set(key, { count: 1, resetAt: now + MINUTE_MS });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  }

  async function list(): Promise<Town[] | null> {
    try {
      return await deps.towns();
    } catch (err) {
      deps.log(`places: town list unavailable (${err instanceof Error ? err.message : 'unknown'})`);
      return null;
    }
  }

  app.get('/cities', async (c) => {
    const address = (await deps.sessionAddress(c))?.toLowerCase();
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const parsed = searchSchema.safeParse({ country: c.req.query('country') ?? '', q: c.req.query('q') });
    if (!parsed.success) return c.json({ error: 'invalid search' }, 400);
    if (!allowed(`search:${address}`, SEARCH_PER_MINUTE)) return c.json({ error: 'too many searches, wait a minute' }, 429);
    const towns = await list();
    if (!towns) return c.json({ error: 'towns unavailable' }, 503);
    const found = searchTowns(towns, parsed.data.country, parsed.data.q ?? '');
    return c.json({ towns: found.map((t) => ({ name: t.name, admin: t.admin })) });
  });

  app.post('/near', async (c) => {
    const address = (await deps.sessionAddress(c))?.toLowerCase();
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const parsed = pointSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid position' }, 400);
    if (!allowed(`near:${address}`, NEAR_PER_MINUTE)) return c.json({ error: 'too many tries, wait a minute' }, 429);
    const towns = await list();
    if (!towns) return c.json({ error: 'towns unavailable' }, 503);
    const town = nearestTown(towns, parsed.data);
    return c.json(town ? { country: town.cc, city: town.name, admin: town.admin } : { country: null });
  });

  return app;
}

/// Mounted at /api/places, signed in the same way as setup.
const setupLive = () => import('../setup/live.js').then((m) => m.liveSetupDeps);
export const placesRoutes = createPlacesRoutes({
  sessionAddress: async (c) => (await setupLive()).sessionAddress(c),
  towns: async () => (await import('../location/places.js')).allTowns(),
  now: Date.now,
  log: (line) => console.warn(line),
});
