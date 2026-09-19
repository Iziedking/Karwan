import { Hono } from 'hono';
import { z } from 'zod';
import { reportError } from '../errorTracker.js';
import { rateLimit } from '../middleware/rateLimit.js';

/// Browser crashes, reported by the frontend's route error boundaries.
///
/// A render crash used to be visible only in the user's own console: every deal
/// page failed for a week before anyone saw it. Reports land in the same error
/// tracker as backend failures, so /admin/errors (and Sentry when configured)
/// shows them. Public and unauthenticated by design, so the payload is small,
/// validated, rate limited, and never carries identity or query strings.

const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  digest: z.string().trim().max(100).optional(),
  path: z.string().trim().max(200),
  boundary: z.enum(['app', 'deal', 'root']),
});

export type ClientErrorReport = z.infer<typeof clientErrorSchema>;

/// Keeps only a pathname and replaces long hex identifiers, so a report never
/// carries a query string, a fragment or a full deal id.
export function sanitizeClientPath(raw: string): string {
  const path = raw.split(/[?#]/)[0] ?? '';
  return (path.startsWith('/') ? path : `/${path}`).replace(/0x[0-9a-fA-F]{16,}/g, ':id').slice(0, 200);
}

export const clientErrorRoutes = new Hono();

clientErrorRoutes.post(
  '/',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, name: 'client-errors' }),
  async (c) => {
    const parsed = clientErrorSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid client error report' }, 400);
    const report = parsed.data;
    reportError(`client.${report.boundary}`, new Error(report.message), {
      path: sanitizeClientPath(report.path),
      ...(report.digest ? { digest: report.digest } : {}),
    });
    return c.body(null, 204);
  },
);
