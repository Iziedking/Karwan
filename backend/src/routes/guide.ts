import { Hono } from 'hono';
import { config } from '../config.js';
import { readSession, sessionAddress } from '../auth/session.js';
import { readSetupFacts } from '../guide/readSetupFacts.js';
import { setupSteps } from '../guide/setupSteps.js';
import { readNextMoves } from '../guide/readNextMoves.js';
import { logger } from '../logger.js';
import { carryProfile, getProfile, upsertProfile, type UserSettings } from '../db/profiles.js';
import { afterSnooze, utcDay } from '../guide/askLess.js';
import { SETUP_KEYS, type SetupKey } from '../guide/setupSteps.js';
import { readMoment } from '../guide/readMoment.js';

const isStep = (v: unknown): v is SetupKey => typeof v === 'string' && (SETUP_KEYS as readonly string[]).includes(v);

/// Merges a few guide fields into the account's settings, leaving every other setting as it is.
async function rememberGuide(address: string, patch: (s: UserSettings) => Partial<UserSettings>): Promise<UserSettings | null> {
  const existing = await getProfile(address);
  if (!existing) return null;
  const settings: UserSettings = { ...(existing.settings ?? {}), ...patch(existing.settings ?? {}) };
  const updated = await upsertProfile({ ...carryProfile(existing, ['settings']), settings });
  return updated.settings ?? settings;
}

export const guideRoutes = new Hono();

/// The signed-in person's next moves (view 57), most urgent first. Their own
/// session only: there is no address parameter to read someone else's.
guideRoutes.get('/next', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  try {
    const moves = await readNextMoves(address, readSession(c)?.method);
    return c.json({ moves: moves.slice(0, 3) });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'guide next failed');
    return c.json({ moves: [] });
  }
});

/// The way to fully set up (view 57, 15 Nov): the list Home's checklist shows,
/// the same one Aman and the assistant read.
guideRoutes.get('/setup', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  try {
    return c.json(setupSteps(await readSetupFacts(address, readSession(c)?.method), config.ARC_NETWORK));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'guide setup failed');
    return c.json({ steps: [], next: null, complete: false, known: false });
  }
});

/// Not now on a setup step (view 57, 15 Nov evening): held for 3 days, then 14,
/// by this server's clock, on the account so every device and channel agree.
guideRoutes.post('/snooze', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const body = (await c.req.json().catch(() => null)) as { step?: unknown } | null;
  if (!isStep(body?.step)) return c.json({ error: 'unknown step' }, 400);
  const step = body.step;
  const now = Date.now();
  const saved = await rememberGuide(address, (s) => ({ guideSnooze: { ...(s.guideSnooze ?? {}), [step]: afterSnooze(s.guideSnooze?.[step], now) } }));
  if (!saved) return c.json({ error: 'no profile' }, 404);
  return c.json({ snooze: saved.guideSnooze?.[step] ?? null });
});

/// A setup step was shown today: no other setup step is asked until tomorrow.
guideRoutes.post('/asked', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const body = (await c.req.json().catch(() => null)) as { step?: unknown } | null;
  if (!isStep(body?.step)) return c.json({ error: 'unknown step' }, 400);
  const step = body.step;
  const saved = await rememberGuide(address, () => ({ guideAskedOn: utcDay(Date.now()), guideAskedStep: step }));
  if (!saved) return c.json({ error: 'no profile' }, 404);
  return c.json({ askedOn: saved.guideAskedOn, step: saved.guideAskedStep });
});

/// The one moment to react to now, or null (view 57, 15 Nov evening).
guideRoutes.get('/moment', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  try {
    const profile = await getProfile(address);
    return c.json({ moment: await readMoment(address, profile?.settings?.guideMomentAt ?? 0) });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'guide moment failed');
    return c.json({ moment: null });
  }
});

/// A moment was shown: no device shows it, or anything older, again. The time
/// comes from the moment's id and never moves the mark backwards.
guideRoutes.post('/moment/seen', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const body = (await c.req.json().catch(() => null)) as { id?: unknown } | null;
  const at = typeof body?.id === 'string' ? Number(body.id.split(':').pop()) : NaN;
  if (!Number.isSafeInteger(at) || at <= 0 || at > Date.now() + 60_000) return c.json({ error: 'unknown moment' }, 400);
  const saved = await rememberGuide(address, (s) => ({ guideMomentAt: Math.max(s.guideMomentAt ?? 0, at) }));
  if (!saved) return c.json({ error: 'no profile' }, 404);
  return c.json({ seenAt: saved.guideMomentAt });
});
