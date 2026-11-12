import { Hono } from 'hono';
import type { MoneyMovement } from '../money/model.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { deskMoves } from '../ops/deskMoves.js';

/// GET /api/admin/money-moves (view 79): the Money moves page. Open moves of
/// any age, plus everything touched in the last week; the page shows today's
/// done ones.
export const adminMovesRoutes = new Hono();

const WEEK = 7 * 24 * 3_600_000;

interface MovesSource {
  list: (q: { since: number; limit: number }) => Promise<MoneyMovement[]>;
  handles: () => Promise<Map<string, string>>;
}

const live: MovesSource = {
  list: async (q) => (await import('../db/moneyMovements.js')).listMoneyMovementsForDesk(q),
  handles: async () => {
    const { listProfiles } = await import('../db/profiles.js');
    const map = new Map<string, string>();
    for (const p of await listProfiles()) if (p.handle) map.set(p.address.toLowerCase(), p.handle);
    return map;
  },
};

let source: MovesSource = live;

export function useMovesForTests(s: MovesSource): void {
  source = s;
}

adminMovesRoutes.get('/money-moves', requireAdmin, async (c) => {
  const now = Date.now();
  const [movements, handles] = await Promise.all([source.list({ since: now - WEEK, limit: 500 }), source.handles()]);
  return c.json(deskMoves(movements, now, (a) => handles.get(a.toLowerCase()) ?? null));
});
