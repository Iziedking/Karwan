import { Hono } from 'hono';
import { sessionAddress } from '../auth/session.js';
import { readNextMoves } from '../guide/readNextMoves.js';
import { logger } from '../logger.js';

export const guideRoutes = new Hono();

/// The signed-in person's next moves (view 57), most urgent first. Their own
/// session only: there is no address parameter to read someone else's.
guideRoutes.get('/next', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  try {
    const moves = await readNextMoves(address);
    return c.json({ moves: moves.slice(0, 3) });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'guide next failed');
    return c.json({ moves: [] });
  }
});
