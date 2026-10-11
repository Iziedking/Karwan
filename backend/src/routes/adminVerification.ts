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
  if (done === 'in_use') {
    return c.json({ error: 'This number already backs another Karwan account. The request was rejected.', code: 'RC_IN_USE' }, 409);
  }
  return done === 'decided' ? c.json({ ok: true }) : c.json({ error: 'not found or already decided' }, 409);
});

/// Approvals a reviewer may need to undo, newest first.
adminVerificationRoutes.get('/cac/approved', async (c) => {
  const services = verificationServices();
  if (!services) return c.json({ error: 'verification services are off' }, 503);
  return c.json({ approved: await services.cac.approved() });
});

const revokeSchema = z.object({ reviewer: z.string().min(1).max(120), reason: z.string().trim().min(5).max(300) });

/// Undoes an approval made in error: the fact stops counting on the person's
/// record, the number is free again, and the person is told why.
adminVerificationRoutes.post('/cac/:id/revoke', async (c) => {
  const services = verificationServices();
  if (!services) return c.json({ error: 'verification services are off' }, 503);
  const parsed = revokeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'reviewer and a reason are required' }, 400);
  const done = await services.cac.revoke(c.req.param('id'), parsed.data.reviewer, parsed.data.reason);
  return done ? c.json({ ok: true }) : c.json({ error: 'not found or not approved' }, 409);
});
