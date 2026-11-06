import { deleteMessagesOlderThan } from '../db/messages.js';
import { logger } from '../logger.js';
import { leased } from '../ops/leasedLoop.js';

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/// Chat is intentionally short-lived. A restart-safe, database-backed sweep
/// keeps private deal conversations from becoming an unbounded store while
/// listMessages' cutoff is the immediate safety net between sweeps.
export function startChatRetentionSweep(): () => void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const removed = await deleteMessagesOlderThan();
      if (removed > 0) logger.info({ removed }, 'chat retention sweep removed expired messages');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'chat retention sweep failed');
    } finally {
      running = false;
    }
  };
  const run = leased('chatRetention', SWEEP_INTERVAL_MS, sweep);
  void run();
  const timer = setInterval(() => void run(), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

