import { logger } from '../logger.js';
import type { Engagements } from './engagements.js';
import type { WorkRequests } from './workRequests.js';

/// Hourly work's clock (view 32): settles weeks whose review has ended, takes
/// back offers nobody accepted, takes objected hours to the review team, closes
/// finished work and sends each reminder once. The core proves every step from
/// its receipt; a failed one is tried again on the next pass. Posted work
/// nobody was hired for closes when offers close.
const EVERY_MS = 10 * 60_000;

export function startWorkRunner(core: Engagements | null, requests: WorkRequests | null = null): () => void {
  if (!core) return () => {};
  let running = false;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      const done = await core.runDue();
      const expired = requests ? await requests.expireDue() : 0;
      if (expired) logger.info({ expired }, 'posted hourly work closed with nobody hired');
      const failed = done.filter((d) => d.includes(':error:'));
      if (done.length) logger.info({ done: done.length, failed }, 'hourly work runner pass');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'hourly work runner pass failed');
    } finally {
      running = false;
    }
  };
  const id = setInterval(() => void pass(), EVERY_MS);
  id.unref?.();
  return () => clearInterval(id);
}
