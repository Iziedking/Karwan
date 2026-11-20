import { Hono } from 'hono';
import { meaningKeeper } from '../matching/meaningKeeper.js';
import { sellerIndex } from '../matching/sellerIndex.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { dismissSuggestion, listOpenSuggestions } from '../db/wordMapSuggestions.js';

/// GET /api/admin/word-map and POST /api/admin/word-map/:id/dismiss (view 95):
/// pairs the model judge matched that share no word, for the team to add to
/// backend/src/matching/wordMap.ts or put away. Words only.
export const adminWordMapRoutes = new Hono();

/// Whether matching by meaning is on (view 95 phase 2) and how many sellers on
/// the market hold a vector for the current model.
function meaningCounts() {
  const { model, sellers: withVector } = meaningKeeper.counts();
  const sellers = sellerIndex.entries().filter((s) => s.onMarket && !s.example).length;
  return { on: model !== null, model, sellers, withVector };
}

adminWordMapRoutes.get('/word-map', requireAdmin, async (c) => c.json({ suggestions: await listOpenSuggestions(), meaning: meaningCounts() }));

adminWordMapRoutes.post('/word-map/:id/dismiss', requireAdmin, async (c) => {
  const done = await dismissSuggestion(c.req.param('id') ?? '');
  return done ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});
