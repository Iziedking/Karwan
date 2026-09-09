import { Hono } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import {
  createBusinessWorkspace,
  getOwnedWorkspace,
  listTradeAvailability,
  listWorkspaces,
  removeTradeAvailability,
  saveTradeAvailability,
  updateBusinessWorkspace,
} from '../db/workspaces.js';
import type { TradeAvailability } from '../db/profiles.js';

const workspaceId = z.string().min(3).max(120);
const name = z.string().trim().min(1).max(120);
const tradeType = z.enum(['goods', 'services']);
const availabilitySchema = z.object({
  id: z.string().min(1).max(120).optional(),
  tradeType,
  title: name.max(140),
  description: z.string().trim().max(500).optional(),
  region: z.string().trim().max(120).optional(),
  unit: z.string().trim().max(80).optional(),
  active: z.boolean().default(true),
});

const updateWorkspaceSchema = z.object({
  name: name.optional(),
});

export const workspaceRoutes = new Hono();

function owner(c: Parameters<typeof sessionAddress>[0]): string | null {
  return sessionAddress(c);
}

workspaceRoutes.get('/', async (c) => {
  const address = owner(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  return c.json({
    workspaces: await listWorkspaces(address),
    wallet: { address, balanceScope: 'identity' as const },
  });
});

workspaceRoutes.post('/business', async (c) => {
  const address = owner(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  let body: { name: string };
  try {
    body = z.object({ name }).parse(await c.req.json());
  } catch {
    return c.json({ error: 'business workspace name is required' }, 400);
  }
  try {
    const workspace = await createBusinessWorkspace(address, body);
    return c.json({ workspace }, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 404);
  }
});

workspaceRoutes.get('/:id', async (c) => {
  const address = owner(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const id = workspaceId.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'invalid workspace id' }, 400);
  const result = await getOwnedWorkspace(address, id.data);
  if (!result) return c.json({ error: 'workspace not found' }, 404);
  return c.json({ workspace: { ...result.workspace, membership: result.membership } });
});

workspaceRoutes.patch('/:id', async (c) => {
  const address = owner(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const id = workspaceId.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'invalid workspace id' }, 400);
  let body: z.infer<typeof updateWorkspaceSchema>;
  try {
    body = updateWorkspaceSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid workspace update' }, 400);
  }
  const workspace = await updateBusinessWorkspace(address, id.data, { name: body.name });
  if (!workspace) return c.json({ error: 'business workspace not found' }, 404);
  return c.json({ workspace });
});

workspaceRoutes.get('/:id/availability', async (c) => {
  const address = owner(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const id = workspaceId.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'invalid workspace id' }, 400);
  const result = await getOwnedWorkspace(address, id.data);
  if (!result) return c.json({ error: 'workspace not found' }, 404);
  return c.json({ availability: await listTradeAvailability(address, id.data) });
});

workspaceRoutes.post('/:id/availability', async (c) => {
  const address = owner(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const id = workspaceId.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'invalid workspace id' }, 400);
  let body: z.infer<typeof availabilitySchema>;
  try {
    body = availabilitySchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid trade availability record' }, 400);
  }
  const record = await saveTradeAvailability(address, id.data, body as Omit<TradeAvailability, 'id' | 'createdAt' | 'updatedAt'> & { id?: string });
  if (!record) return c.json({ error: 'business workspace not found' }, 404);
  return c.json({ availability: record }, body.id ? 200 : 201);
});

workspaceRoutes.delete('/:id/availability/:availabilityId', async (c) => {
  const address = owner(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  const id = workspaceId.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'invalid workspace id' }, 400);
  const removed = await removeTradeAvailability(address, id.data, c.req.param('availabilityId'));
  if (!removed) return c.json({ error: 'availability record not found' }, 404);
  return c.json({ ok: true });
});
