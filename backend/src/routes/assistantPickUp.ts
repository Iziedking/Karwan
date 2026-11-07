import { Hono, type Context } from 'hono';
import { RETURN_AFTER_MS, type PickUp } from '../assistant/pickUp.js';

/// GET /api/assistant/pick-up (view 66): what the signed-in person left
/// unfinished, for the line the assistant page shows after a break. Null
/// when memory is off, when they were here in the last six hours, or when
/// nothing is unfinished.

export interface PickUpRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  memoryOn: (address: string) => Promise<boolean>;
  read: (address: string, now: number) => Promise<PickUp | null>;
  now?: () => number;
}

export function createAssistantPickUpRoutes(deps: PickUpRouteDeps): Hono {
  const app = new Hono();
  const now = deps.now ?? Date.now;

  app.get('/', async (c) => {
    const address = (await deps.sessionAddress(c))?.toLowerCase();
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    c.header('Cache-Control', 'no-store');
    if (!(await deps.memoryOn(address).catch(() => false))) return c.json({ pickUp: null });
    const at = now();
    const pickUp = await deps.read(address, at).catch((): null => null);
    return c.json({ pickUp: pickUp && at - pickUp.at >= RETURN_AFTER_MS ? pickUp : null });
  });

  return app;
}

/// Mounted at /api/assistant/pick-up. The session and stores load on first use.
export const assistantPickUpRoutes = createAssistantPickUpRoutes({
  sessionAddress: async (c) => (await import('../auth/session.js')).sessionAddress(c),
  memoryOn: async (address) => (await (await import('../db/assistantMemory.js')).getMemory(address)).enabled,
  read: async (address, at) => (await import('../assistant/pickUpLive.js')).readPickUp(address, at),
});
