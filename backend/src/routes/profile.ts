import { Hono } from 'hono';
import { z } from 'zod';
import { getProfile, upsertProfile, findProfileByXHandle } from '../db/profiles.js';
import { extractKeywords } from '../llm/keywords.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const profileSchema = z.object({
  address: addrSchema,
  role: z.enum(['buyer', 'seller', 'both']),
  displayName: z.string().min(1).max(80),
  seller: z
    .object({
      skills: z.array(z.string().min(1)).min(1).max(20),
      bio: z.string().max(400).default(''),
      minBudgetUsdc: z.number().nonnegative(),
      maxBudgetUsdc: z.number().positive(),
      minDeadlineDays: z.number().int().min(0).max(90),
      maxDeadlineDays: z.number().int().min(1).max(180),
    })
    .optional(),
  buyer: z
    .object({
      maxBudgetUsdc: z.number().positive(),
      minDeadlineDays: z.number().int().min(0).max(90),
      maxDeadlineDays: z.number().int().min(1).max(180),
      bidCollectionSeconds: z.number().int().min(5).max(600),
      milestonePcts: z.array(z.number().int().min(1).max(100)).min(1).max(4),
    })
    .optional(),
});

export const profileRoutes = new Hono();

profileRoutes.get('/', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const profile = await getProfile(parsed.data);
  return c.json({ profile });
});

profileRoutes.post('/', async (c) => {
  let body;
  try {
    body = profileSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if ((body.role === 'seller' || body.role === 'both') && !body.seller) {
    return c.json({ error: 'seller profile required when role includes seller' }, 400);
  }
  if ((body.role === 'buyer' || body.role === 'both') && !body.buyer) {
    return c.json({ error: 'buyer profile required when role includes buyer' }, 400);
  }
  if (body.seller && body.seller.minBudgetUsdc > body.seller.maxBudgetUsdc) {
    return c.json({ error: 'seller minBudgetUsdc cannot exceed maxBudgetUsdc' }, 400);
  }
  if (body.buyer && body.buyer.milestonePcts.reduce((s, n) => s + n, 0) !== 100) {
    return c.json({ error: 'buyer milestonePcts must sum to 100' }, 400);
  }

  // Extract canonical match keywords from the seller profile (skills+bio) so
  // future buyer briefs can be filtered/ranked against this seller. Fails open:
  // an empty keywords array on LLM error still saves the profile.
  const sellerWithKeywords: (typeof body.seller & { keywords: string[] }) | undefined =
    body.seller
      ? {
          ...body.seller,
          keywords: await extractKeywords(
            [body.seller.skills.join(', '), body.seller.bio].filter(Boolean).join('. '),
            `seller-profile:${body.address}`,
          ),
        }
      : undefined;
  if (sellerWithKeywords) {
    logger.info(
      { address: body.address, keywords: sellerWithKeywords.keywords },
      'seller profile keywords extracted',
    );
  }

  const profile = await upsertProfile({ ...body, seller: sellerWithKeywords });
  return c.json({ profile }, 200);
});

// Bind / unbind an X handle on the profile. Caller is the wallet that owns the
// profile; the handle is validated lightly (X enforces a stricter shape, but
// the surface is informational so the regex is forgiving).
const xHandleSchema = z.object({
  address: addrSchema,
  handle: z
    .string()
    .trim()
    .regex(/^@?[A-Za-z0-9_]{1,15}$/, 'expected an X handle like @karwan or karwan')
    .nullable(),
});

profileRoutes.post('/x-handle', async (c) => {
  let body;
  try {
    body = xHandleSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const existing = await getProfile(body.address);
  if (!existing) return c.json({ error: 'profile not found' }, 404);
  const normalised = body.handle ? body.handle.replace(/^@/, '') : undefined;
  // One X handle binds to one wallet. Block if another account already owns it.
  if (normalised) {
    const owner = await findProfileByXHandle(normalised);
    if (owner && owner.address.toLowerCase() !== existing.address.toLowerCase()) {
      return c.json(
        {
          error: 'x handle already linked',
          detail: `@${normalised} is already connected to another Karwan account.`,
        },
        409,
      );
    }
  }
  const profile = await upsertProfile({
    address: existing.address,
    role: existing.role,
    displayName: existing.displayName,
    seller: existing.seller,
    buyer: existing.buyer,
    xHandle: normalised,
  });
  logger.info({ address: existing.address, handle: normalised ?? null }, 'x handle updated');
  return c.json({ profile }, 200);
});
