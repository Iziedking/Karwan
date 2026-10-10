import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth.js';
import { verificationServices } from '../verification/services.js';

/// Reviewer queue for business registrations. A reviewer checks the number
/// and name against the public CAC search and approves or rejects.
export const adminVerificationRoutes = new Hono();
adminVerificationRoutes.use('*', requireAdmin);

adminVerificationRoutes.get('/cac', async (c) => {
  const services = verificationServices();
  if (!services) return c.json({ error: 'verification services are off' }, 503);
  return c.json({ pending: await services.cac.pending() });
});

const decisionSchema = z.object({ approved: z.boolean(), reviewer: z.string().min(1).max(120) });

adminVerificationRoutes.post('/cac/:id', async (c) => {
  const services = verificationServices();
  if (!services) return c.json({ error: 'verification services are off' }, 503);
  const parsed = decisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'approved and reviewer are required' }, 400);
  const done = await services.cac.decide(c.req.param('id'), parsed.data.approved, parsed.data.reviewer);
  return done ? c.json({ ok: true }) : c.json({ error: 'not found or already decided' }, 409);
});
