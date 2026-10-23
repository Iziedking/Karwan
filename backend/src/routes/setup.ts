import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { BriefResult, ProfilePatch } from '../agents/agentBrief.js';
import type { BriefAnswers } from '../agents/agentBriefLines.js';
import type { UserLocale, UserProfile } from '../db/profiles.js';
import { legacyFromWays, waysSchema, wayLines } from '../agents/ways.js';

/// The setup conversation after activation (view 19). The answers are read on
/// the server: preview shows what they set up, save stores what the server
/// read. A result sent by the browser is never trusted.

const text = (max: number) => z.string().trim().max(max).optional();

export const answersSchema = z.object({
  goals: z.array(z.enum(['work', 'sell', 'buy', 'business', 'record'])).max(5),
  what: text(400),
  price: text(200),
  buy: text(200),
  business: text(200),
  places: text(400),
  clients: z.enum(['own', 'find', 'both']).optional(),
  own: z.enum(['offers', 'ask']).optional(),
  reach: z.enum(['telegram', 'email', 'both']).optional(),
  where: text(120),
  paid: z.enum(['one_time', 'milestones', 'goods']).optional(),
  retried: z.boolean().optional(),
});

const bodySchema = z.object({ answers: answersSchema });

export interface SetupRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  current: (address: string) => Promise<UserProfile | null>;
  read: (answers: BriefAnswers, current: UserProfile | null, locale: UserLocale) => Promise<BriefResult>;
  save: (address: string, patch: ProfilePatch) => Promise<UserProfile | null>;
  saveLocation: (address: string, place: { country: string; city: string | null }) => Promise<void>;
  locale: (address: string) => Promise<UserLocale>;
  now: () => number;
}

const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;

export function createSetupRoutes(deps: SetupRouteDeps): Hono {
  const app = new Hono();
  const used = new Map<string, { count: number; resetAt: number }>();

  /// Each reading may call the model, so an account gets a fixed number per
  /// window whatever network it comes from.
  function allowed(address: string): boolean {
    const now = deps.now();
    const bucket = used.get(address);
    if (!bucket || bucket.resetAt <= now) {
      used.set(address, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= LIMIT;
  }

  async function reading(c: Context) {
    const address = (await deps.sessionAddress(c))?.toLowerCase();
    if (!address) return { error: c.json({ error: 'not authenticated' }, 401) } as const;
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return { error: c.json({ error: 'invalid answers' }, 400) } as const;
    if (!allowed(address)) return { error: c.json({ error: 'too many tries, wait a few minutes' }, 429) } as const;
    const current = await deps.current(address);
    const result = await deps.read(parsed.data.answers, current, await deps.locale(address));
    return { address, result } as const;
  }

  app.post('/preview', async (c) => {
    const r = await reading(c);
    if ('error' in r) return r.error;
    return c.json({ lines: r.result.lines, needs: r.result.needs });
  });

  app.post('/save', async (c) => {
    const r = await reading(c);
    if ('error' in r) return r.error;
    if (r.result.needs.length) return c.json({ error: 'answer needed', needs: r.result.needs }, 409);
    const patch: ProfilePatch = { ...r.result.patch, settings: { ...r.result.patch.settings, setupDoneAt: deps.now() } };
    const profile = await deps.save(r.address, patch);
    if (!profile) return c.json({ error: 'profile not found' }, 404);
    if (r.result.place) await deps.saveLocation(r.address, r.result.place);
    return c.json({ profile });
  });

  /// The ways this person deals (view 26), saved whole. Moves no money and
  /// calls no model; the older seller and buyer settings follow the ways.
  app.post('/ways', async (c) => {
    const address = (await deps.sessionAddress(c))?.toLowerCase();
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const parsed = z.object({ ways: waysSchema }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid ways', issues: parsed.error.issues.map((i) => i.message) }, 400);
    if (!allowed(address)) return c.json({ error: 'too many tries, wait a few minutes' }, 429);
    const current = await deps.current(address);
    if (!current) return c.json({ error: 'profile not found' }, 404);
    const { ways } = parsed.data;
    const { seller, buyer } = legacyFromWays(ways, current);
    const patch: ProfilePatch = {
      agentWays: ways,
      seller,
      buyer,
      role: seller && buyer ? 'both' : seller ? 'seller' : 'buyer',
      agentPrefs: {
        ...(current.agentPrefs ?? {}),
        ...(ways.sell.length ? { sellerPriceSet: true } : {}),
        ...(ways.buy.length ? { buyerPriceSet: true } : {}),
      },
    };
    const profile = await deps.save(address, patch);
    if (!profile) return c.json({ error: 'profile not found' }, 404);
    return c.json({ profile, lines: wayLines(ways) });
  });

  return app;
}

/// Mounted at /api/setup. The live wiring loads on first use, so importing this
/// file (tests, the route inventory) never opens the database or a model.
const live = () => import('../setup/live.js').then((m) => m.liveSetupDeps);
export const setupRoutes = createSetupRoutes({
  sessionAddress: async (c) => (await live()).sessionAddress(c),
  current: async (address) => (await live()).current(address),
  read: async (answers, current, locale) => (await live()).read(answers, current, locale),
  save: async (address, patch) => (await live()).save(address, patch),
  saveLocation: async (address, place) => (await live()).saveLocation(address, place),
  locale: async (address) => (await live()).locale(address),
  now: Date.now,
});
