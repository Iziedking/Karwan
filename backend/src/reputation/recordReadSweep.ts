import { purgeReadDetails } from '../db/recordReads.js';
import { logger } from '../logger.js';

const SWEEP_INTERVAL_MS = 600_000;

/// Clears the signed detail of every record read older than a day, at boot and
/// then every 10 minutes, so no detail outlives its 24 hours by more than that.
export function startRecordReadSweep(): () => void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const cleared = await purgeReadDetails(Date.now());
      if (cleared > 0) logger.info({ cleared }, 'record read sweep cleared expired details');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'record read sweep failed');
    } finally {
      running = false;
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
