import { listExpirableJobs, expireJob } from './buyer.js';
import { reconcileActiveBids } from './seller.js';
import { listAllDeals } from '../db/deals.js';
import { reRaiseNearMissFromPassed } from './nearMiss.js';
import { getOutOfReach } from '../db/outOfReach.js';
import { getPendingNearMiss } from '../db/nearMiss.js';
import { deleteMatchProposal } from '../db/matchProposals.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';

const TICK_MS = 30_000;

/// A match proposal is human-gated, so the watcher does NOT expire a job the
/// instant its deadline passes while a proposal awaits the buyer's approval. But
/// a proposal that sits unresolved past the deadline must not linger forever: a
/// buyer who never approves or declines was otherwise stuck on a dead auction
/// with no way to close it (funded escrow uses the /deals cancel path instead and
/// is excluded upstream). Once a proposal is this far past the deadline, retire
/// it so the job reaches a terminal state. Override via env.
const MATCH_STALE_GRACE_MS = Number(process.env.MATCH_STALE_GRACE_MS) || 24 * 60 * 60 * 1000;

/// How long before a request's deadline to give a final "last call". When the
/// buyer passed the best real price and nothing cheaper turned up, the agent
/// re-surfaces that offer as a proceed/pass once, in this lead window, so the
/// deal isn't lost to silence. Capped at the deadline by the near-miss window.
const LAST_CALL_LEAD_MS = Number(process.env.OUT_OF_REACH_LAST_CALL_LEAD_MS) || 60 * 60 * 1000;

/// If a request is out of reach (buyer passed, nothing cheaper) and its deadline
/// is near, re-surface the passed offer as a final proceed/pass. Fires at most
/// once per request (lastCallAt), never while another near-miss is pending.
function maybeLastCall(jobId: string, deadlineUnix: number, now: number): void {
  if (now < deadlineUnix * 1000 - LAST_CALL_LEAD_MS) return;
  const rec = getOutOfReach(jobId);
  if (!rec?.passed || rec.lastCallAt) return;
  if (getPendingNearMiss(jobId)) return;
  const raised = reRaiseNearMissFromPassed(jobId, deadlineUnix, { auto: true });
  if (raised) {
    logger.info(
      { jobId, proceedPriceUsdc: raised.proceedPriceUsdc },
      'deadline last-call: re-surfaced the passed offer before expiry',
    );
  }
}

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
    if (job.hasMatchProposal) {
      // Leave a pending proposal alone until it is well past the deadline, then
      // retire it (expire the job + drop the stale proposal) so the buyer isn't
      // stuck on a dead auction with no way to close it.
      if (now > job.deadlineUnix * 1000 + MATCH_STALE_GRACE_MS) {
        try {
          if (expireJob(job.jobId)) {
            await deleteMatchProposal(job.jobId);
            logger.info(
              { jobId: job.jobId, deadlineUnix: job.deadlineUnix },
              'retired a stale match proposal that sat past the deadline',
            );
          }
        } catch (err) {
          logger.warn(
            { jobId: job.jobId, err: (err as Error).message },
            'stale match proposal retirement threw',
          );
        }
      }
      continue;
    }
    if (now <= job.deadlineUnix * 1000) {
      // Not expired yet. Give a deadline last-call if it's out of reach.
      maybeLastCall(job.jobId, job.deadlineUnix, now);
      continue;
    }
    try {
      expireJob(job.jobId);
    } catch (err) {
      logger.warn(
        { jobId: job.jobId, err: (err as Error).message },
        'expireJob threw',
      );
    }
  }

  // Prune the seller agents' active-bid map: any bid whose auction concluded (a
  // deal exists for the job) or whose deadline passed is done, so it stops
  // showing as "negotiating" and does not accumulate across restarts.
  try {
    const deals = await listAllDeals();
    const resolved = new Set(deals.map((d) => d.jobId.toLowerCase()));
    reconcileActiveBids(resolved, now);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'active-bid reconcile failed');
  }
}

/// Starts the periodic job-expiry watcher. Returns a stop function. Pairs
/// with the deadline picker on PostJobForm. Short-deadline briefs that
/// don't find a match within their window now reach a deterministic
/// terminal state instead of lingering in `open` forever.
export function startJobExpiryWatcher(): () => void {
  const id = setInterval(() => {
    recordHeartbeat('jobExpiryWatcher');
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
