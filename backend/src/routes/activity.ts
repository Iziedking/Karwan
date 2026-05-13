import { Hono } from 'hono';
import { bus } from '../events.js';

export const activityRoutes = new Hono();

activityRoutes.get('/', (c) => {
  const limitParam = c.req.query('limit');
  const jobId = c.req.query('jobId') ?? undefined;
  const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 100;
  return c.json({ events: bus.recent(limit, jobId) });
});
