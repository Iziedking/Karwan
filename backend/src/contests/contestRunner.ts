import { logger } from '../logger.js';
import type { Contests } from './contests.js';

/// Returns every contest prize nobody picked by its award date (view 40). The
/// core proves each return from its receipt; a failed one stays open for the
/// next pass.
const EVERY_MS = 10 * 60_000;

export function startContestRunner(core: Contests | null): () => void {
  if (!core) return () => {};
  let running = false;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      const n = await core.returnDue();
      if (n) logger.info({ returned: n }, 'contest prizes returned');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'contest runner pass failed');
    } finally {
      running = false;
    }
  };
  const id = setInterval(() => void pass(), EVERY_MS);
  id.unref?.();
  return () => clearInterval(id);
}
