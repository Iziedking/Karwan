import { Hono } from 'hono';
import { config } from '../config.js';
import { readSession, sessionAddress } from '../auth/session.js';
import { readSetupFacts } from '../guide/readSetupFacts.js';
import { setupSteps } from '../guide/setupSteps.js';
import { readNextMoves } from '../guide/readNextMoves.js';
import { logger } from '../logger.js';

export const guideRoutes = new Hono();

/// The signed-in person's next moves (view 57), most urgent first. Their own
/// session only: there is no address parameter to read someone else's.
guideRoutes.get('/next', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  try {
    const moves = await readNextMoves(address, readSession(c)?.method);
    return c.json({ moves: moves.slice(0, 3) });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'guide next failed');
    return c.json({ moves: [] });
  }
});

/// The way to fully set up (view 57, 15 Nov): the list Home's checklist shows,
/// the same one Aman and the assistant read.
guideRoutes.get('/setup', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'not authenticated' }, 401);
  try {
    return c.json(setupSteps(await readSetupFacts(address, readSession(c)?.method), config.ARC_NETWORK));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'guide setup failed');
    return c.json({ steps: [], next: null, complete: false, known: false });
  }
});
