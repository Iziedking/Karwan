import { listExpirableJobs, expireJob } from './buyer.js';
import { logger } from '../logger.js';

const TICK_MS = 30_000;

/// One pass over tracked jobs. A job is expired when:
///   - its on-chain deadline has passed (`now > deadlineUnix * 1000`)
///   - it's not finalized (no accepted bid)
///   - it's not escrow-funded (no live deal)
///   - no MatchProposal is awaiting human approval (human is the gate, not
///     the clock; if the human ignores it past the deadline, the proposal
///     persists)
///
/// Idempotent: `expireJob` rejects re-expiry. The first hit wins.
async function tick(): Promise<void> {
  const now = Date.now();
  const candidates = await listExpirableJobs();
  for (const job of candidates) {
    if (job.hasMatchProposal) continue;
    if (now <= job.deadlineUnix * 1000) continue;
    try {
      expireJob(job.jobId);
    } catch (err) {
      logger.warn(
        { jobId: job.jobId, err: (err as Error).message },
        'expireJob threw',
      );
    }
  }
}

/// Starts the periodic job-expiry watcher. Returns a stop function. Pairs
/// with the deadline picker on PostJobForm — short-deadline briefs that
/// don't find a match within their window now reach a deterministic
/// terminal state instead of lingering in `open` forever.
export function startJobExpiryWatcher(): () => void {
  const id = setInterval(() => {
    tick().catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'job expiry watcher tick failed',
      );
    });
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'job expiry watcher started');
  return () => clearInterval(id);
}
