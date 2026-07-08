import { Hono } from 'hono';
import { z } from 'zod';
import {
  getProfile,
  upsertProfile,
  carryProfile,
  type UserSettings,
  type UserLocale,
} from '../db/profiles.js';
import { sessionAddress } from '../auth/session.js';
import { logger } from '../logger.js';

const localeSchema = z.enum(['en', 'ar', 'fr', 'hi', 'sw']);
const themeSchema = z.enum(['light', 'dark', 'system']);

const settingsSchema = z.object({
  // Deprecated: the profile keyed is the signed session, not this field. Kept
  // optional so existing clients that still send it don't 400.
  address: z.string().optional(),
  settings: z.object({
    locale: localeSchema.optional(),
    theme: themeSchema.optional(),
    soundEnabled: z.boolean().optional(),
    notificationsMuted: z.boolean().optional(),
    publicPassport: z.boolean().optional(),
  }),
});

export const settingsRoutes = new Hono();

/// GET /api/settings returns the signed-in user's current settings. Identity
/// is the session, not a query param, so one user can't read another's prefs.
/// Falls back to an empty object when the profile has no settings record.
settingsRoutes.get('/', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const profile = await getProfile(address);
  return c.json({ settings: (profile?.settings ?? {}) as UserSettings });
});

/// POST /api/settings merges new settings into the profile. Allows a partial
/// update so each Settings toggle can save independently without resending the
/// whole object. The user's existing profile must exist (we do not create one
/// here; profile creation owns the onboarding flow).
settingsRoutes.post('/', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  let body;
  try {
    body = settingsSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const existing = await getProfile(address);
  if (!existing) {
    // Auto-bootstrap a minimal profile so a brand-new visitor can save their
    // locale during onboarding before they pick a role. Role + displayName
    // get populated later by the existing /api/profile path.
    const bootstrap = await upsertProfile({
      address,
      role: 'buyer',
      displayName: '',
      settings: body.settings,
    });
    logger.info({ address, settings: body.settings }, 'settings bootstrap');
    return c.json({ settings: bootstrap.settings ?? {} }, 200);
  }
  const merged: UserSettings = { ...(existing.settings ?? {}), ...body.settings };
  const updated = await upsertProfile({
    ...carryProfile(existing, ['settings']),
    settings: merged,
  });
  logger.info({ address, settings: merged }, 'settings updated');
  return c.json({ settings: updated.settings ?? {} }, 200);
});

export type { UserLocale };
