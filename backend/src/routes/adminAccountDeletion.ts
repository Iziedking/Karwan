import { Hono } from 'hono';
import { z } from 'zod';
import type { AccountDeletion } from '../accountDeletion/service.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const requestSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  reviewer: z.string().trim().min(1).max(120),
});
const refuseSchema = z.object({ reviewer: z.string().trim().min(1).max(120), reason: z.string().trim().min(5).max(300) });

/// Chat account deletions for a reviewer: the list, a request made by email
/// or on karwan.site, and stopping one that is waiting. A request made here
/// waits the same 7 days and the person can cancel it in chat.
export function createAdminAccountDeletionRoutes(service: () => Pick<AccountDeletion, 'list' | 'requestByAdmin' | 'refuseByAdmin'>): Hono {
  const app = new Hono();
  app.use('*', requireAdmin);

  app.get('/', async (c) => c.json({ deletions: await service().list(200) }));

  app.post('/', async (c) => {
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'address and reviewer are required' }, 400);
    const r = await service().requestByAdmin(parsed.data.address);
    if (!r.ok) return c.json({ error: r.message }, 409);
    logger.info({ id: r.request.id, reviewer: parsed.data.reviewer }, 'account deletion requested by a reviewer');
    return c.json({ deletion: r.request });
  });

  app.post('/:id/refuse', async (c) => {
    const parsed = refuseSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'reviewer and a reason are required' }, 400);
    const done = await service().refuseByAdmin(c.req.param('id'), parsed.data.reason);
    if (!done) return c.json({ error: 'not found or no longer waiting' }, 409);
    logger.info({ id: c.req.param('id'), reviewer: parsed.data.reviewer }, 'account deletion stopped by a reviewer');
    return c.json({ ok: true });
  });

  return app;
}
