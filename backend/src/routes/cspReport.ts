import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteRecord, getRecord, listRecords, putRecord } from '../db/evidence.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { addCounts, parseCspReports, summarise, SUMMARY_DAYS, type DayCounts } from '../security/cspReport.js';

/// Browsers post here when the page policy blocks something (view 70). Open,
/// because a blocked page has no session to prove; small, limited, and it
/// keeps only counts by rule and origin, one record per day for 30 days.
export const cspReportRoutes = new Hono();

const today = () => new Date().toISOString().slice(0, 10);

cspReportRoutes.post(
  '/',
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'report too large' }, 413) }),
  rateLimit({ windowMs: 10 * 60 * 1000, max: 60, name: 'csp-report' }),
  async (c) => {
    let body: unknown;
    try {
      body = JSON.parse(await c.req.text());
    } catch {
      return c.json({ error: 'invalid report' }, 400);
    }
    const items = parseCspReports(body);
    if (items.length > 0) {
      const day = today();
      const counts = (await getRecord<DayCounts>('csp-report', day)) ?? {};
      await putRecord('csp-report', day, addCounts(counts, items));
    }
    return c.body(null, 204);
  },
);

/// The "Blocked by the page policy" card on /admin/diagnostics.
export const pagePolicyAdminRoutes = new Hono();

pagePolicyAdminRoutes.get('/page-policy', requireAdmin, async (c) => {
  const days = await listRecords<DayCounts>('csp-report');
  const summary = summarise(days, today());
  for (const { key } of days) {
    if (key < summary.since) await deleteRecord('csp-report', key);
  }
  return c.json({ ...summary, days: SUMMARY_DAYS });
});
