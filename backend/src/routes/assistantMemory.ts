import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AssistantMemory } from '../db/assistantMemory.js';

/// What the assistant remembers about the signed-in account (view 20):
/// read it, switch it off or on, delete one note, forget everything.

export interface MemoryRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  get: (address: string) => Promise<AssistantMemory>;
  setEnabled: (address: string, on: boolean) => Promise<AssistantMemory>;
  deleteNote: (address: string, id: string) => Promise<boolean>;
  forgetAll: (address: string) => Promise<void>;
}

const view = (m: AssistantMemory) => ({ enabled: m.enabled, notes: [...m.notes].reverse() });

export function createAssistantMemoryRoutes(deps: MemoryRouteDeps): Hono {
  const app = new Hono();
  const who = async (c: Context) => (await deps.sessionAddress(c))?.toLowerCase() ?? null;
  const unauthenticated = (c: Context) => c.json({ error: 'not authenticated' }, 401);

  app.get('/', async (c) => {
    const address = await who(c);
    if (!address) return unauthenticated(c);
    return c.json(view(await deps.get(address)));
  });

  app.post('/enabled', async (c) => {
    const address = await who(c);
    if (!address) return unauthenticated(c);
    const parsed = z.object({ on: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'on must be true or false' }, 400);
    return c.json(view(await deps.setEnabled(address, parsed.data.on)));
  });

  app.delete('/notes/:id', async (c) => {
    const address = await who(c);
    if (!address) return unauthenticated(c);
    if (!(await deps.deleteNote(address, c.req.param('id')))) return c.json({ error: 'not found' }, 404);
    return c.json(view(await deps.get(address)));
  });

  app.delete('/', async (c) => {
    const address = await who(c);
    if (!address) return unauthenticated(c);
    await deps.forgetAll(address);
    return c.json(view(await deps.get(address)));
  });

  return app;
}

/// Mounted at /api/assistant/memory. The session and store load on first use.
const session = () => import('../auth/session.js');
const store = () => import('../db/assistantMemory.js');
export const assistantMemoryRoutes = createAssistantMemoryRoutes({
  sessionAddress: async (c) => (await session()).sessionAddress(c),
  get: async (address) => (await store()).getMemory(address),
  setEnabled: async (address, on) => (await store()).setMemoryEnabled(address, on),
  deleteNote: async (address, id) => (await store()).deleteNotes(address, [id]),
  forgetAll: async (address) => (await store()).forgetAllNotes(address),
});
