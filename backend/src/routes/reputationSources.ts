import { Hono } from 'hono';
import { z } from 'zod';
import { applySourcesUpdate, sourcesOf, type ReputationSources } from '../reputation/consent.js';

/// A person's reputation sources: the two consents, where else they built a
/// reputation, their reads balance and who read their record. Only the
/// signed-in owner reads or changes it.

export interface ReputationSourcesDeps {
  isSelf: (c: unknown, address: string) => boolean;
  load: (address: string) => Promise<{ reputationSources?: Partial<ReputationSources> } | null>;
  save: (address: string, sources: ReputationSources) => Promise<void>;
  readers: (address: string) => Promise<Array<{ reader: string; purpose: string; createdAt: number }>>;
  nameOf: (address: string) => Promise<{ name: string | null; tag: string | null }>;
  readsBalance: (address: string) => Promise<number | null>;
  now: () => number;
}

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const putSchema = z.object({
  address: addressSchema,
  recordReadable: z.boolean().optional(),
  sourceLookup: z.boolean().optional(),
  interest: z.string().max(1000).optional(),
});

export function createReputationSourcesRoutes(deps: ReputationSourcesDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const address = (c.req.query('address') ?? '').toLowerCase();
    if (!addressSchema.safeParse(address).success || !deps.isSelf(c, address)) {
      return c.json({ error: 'Sign in to see this.' }, 403);
    }
    const [profile, readers, balance] = await Promise.all([
      deps.load(address),
      deps.readers(address),
      deps.readsBalance(address).catch(() => null),
    ]);
    const named = await Promise.all(
      readers.map(async (r) => ({ ...(await deps.nameOf(r.reader)), purpose: r.purpose, at: r.createdAt })),
    );
    return c.json({ sources: sourcesOf(profile), connected: ['karwan'], readers: named, readsBalanceUsdc: balance });
  });

  app.put('/', async (c) => {
    const parsed = putSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request.' }, 400);
    const { address, ...patch } = parsed.data;
    if (!deps.isSelf(c, address)) return c.json({ error: 'Sign in to change this.' }, 403);
    const next = applySourcesUpdate(sourcesOf(await deps.load(address)), patch, deps.now());
    await deps.save(address.toLowerCase(), next);
    return c.json({ sources: next });
  });

  return app;
}
