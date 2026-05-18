import { Hono } from 'hono';
import { z } from 'zod';
import {
  getProfile,
  upsertProfile,
  type UserSettings,
  type UserLocale,
} from '../db/profiles.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const localeSchema = z.enum(['en', 'ar', 'fr', 'hi', 'sw']);
const themeSchema = z.enum(['light', 'dark', 'system']);

const settingsSchema = z.object({
  address: addrSchema,
  settings: z.object({
    locale: localeSchema.optional(),
    theme: themeSchema.optional(),
    soundEnabled: z.boolean().optional(),
    notificationsMuted: z.boolean().optional(),
    publicPassport: z.boolean().optional(),
  }),
});

export const settingsRoutes = new Hono();

/// GET /api/settings?address=0x... returns the user's current settings.
/// Falls back to an empty object when the profile has no settings record.
settingsRoutes.get('/', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const profile = await getProfile(parsed.data);
  return c.json({ settings: (profile?.settings ?? {}) as UserSettings });
});

/// POST /api/settings merges new settings into the profile. Allows a partial
/// update so each Settings toggle can save independently without resending the
/// whole object. The user's existing profile must exist (we do not create one
/// here; profile creation owns the onboarding flow).
settingsRoutes.post('/', async (c) => {
  let body;
  try {
    body = settingsSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const existing = await getProfile(body.address);
  if (!existing) {
    // Auto-bootstrap a minimal profile so a brand-new visitor can save their
    // locale during onboarding before they pick a role. Role + displayName
    // get populated later by the existing /api/profile path.
    const bootstrap = await upsertProfile({
      address: body.address,
      role: 'buyer',
      displayName: '',
      settings: body.settings,
    });
    logger.info({ address: body.address, settings: body.settings }, 'settings bootstrap');
    return c.json({ settings: bootstrap.settings ?? {} }, 200);
  }
  const merged: UserSettings = { ...(existing.settings ?? {}), ...body.settings };
  const updated = await upsertProfile({
    address: existing.address,
    role: existing.role,
    displayName: existing.displayName,
    seller: existing.seller,
    buyer: existing.buyer,
    xHandle: existing.xHandle,
    xUserId: existing.xUserId,
    xProfileImageUrl: existing.xProfileImageUrl,
    settings: merged,
  });
  logger.info({ address: body.address, settings: merged }, 'settings updated');
  return c.json({ settings: updated.settings ?? {} }, 200);
});

export type { UserLocale };
