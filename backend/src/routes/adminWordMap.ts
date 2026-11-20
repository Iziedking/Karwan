import { Hono } from 'hono';
import { requireAdmin } from '../middleware/adminAuth.js';
import { dismissSuggestion, listOpenSuggestions } from '../db/wordMapSuggestions.js';

/// GET /api/admin/word-map and POST /api/admin/word-map/:id/dismiss (view 95):
/// pairs the model judge matched that share no word, for the team to add to
/// backend/src/matching/wordMap.ts or put away. Words only.
export const adminWordMapRoutes = new Hono();

adminWordMapRoutes.get('/word-map', requireAdmin, async (c) => c.json({ suggestions: await listOpenSuggestions() }));

adminWordMapRoutes.post('/word-map/:id/dismiss', requireAdmin, async (c) => {
  const done = await dismissSuggestion(c.req.param('id') ?? '');
  return done ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});
