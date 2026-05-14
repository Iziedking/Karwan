import { config } from '../config.js';
import { listAllDeals, patchDeal } from '../db/deals.js';
import { readEscrow } from '../chain/contracts.js';
import { releaseMilestone, finalizeIfSettled, ESCROW_FUNDED } from '../chain/settlement.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

const TICK_MS = 30_000;
const processing = new Set<string>();

/// One pass over direct deals. Two timers run here:
///  1. First-release: the seller has marked delivered but the buyer has not
///     released the first milestone within the review window. The agent
///     releases it and opens the final-release window.
///  2. Final-release: the first milestone is out and the buyer has not released
///     the final one within the window (plus any "still reviewing" extensions).
///     The agent releases it and settles. Buyer silence past the window counts
///     as acceptance.
async function tick() {
  const now = Date.now();
  for (const deal of await listAllDeals()) {
    if (deal.disputed || deal.cancelledAt || deal.settledAt) continue;
    if (processing.has(deal.jobId)) continue;

    processing.add(deal.jobId);
    try {
      const account = await readEscrow(deal.jobId);
      if (account.state !== ESCROW_FUNDED) continue;

      // Timer 1: first-release auto.
      const firstWindowOpen =
        deal.delivered &&
        !!deal.deliveredAt &&
        !deal.reviewWindowStartedAt &&
        account.milestonesReleased === 0;
      if (firstWindowOpen) {
        if (now <= deal.deliveredAt! + config.DEAL_REVIEW_WINDOW_MS) continue;
        await releaseMilestone(deal.jobId, 0);
        const startedAt = Date.now();
        await patchDeal(deal.jobId, {
          reviewWindowStartedAt: startedAt,
          firstAutoReleased: true,
        });
        bus.emitEvent({
          type: 'deal.review.started',
          jobId: deal.jobId,
          actor: 'buyer',
          payload: {
            buyer: deal.buyer,
            seller: deal.seller,
            windowMs: config.DEAL_REVIEW_WINDOW_MS,
            startedAt,
            auto: true,
          },
        });
        logger.info(
          { jobId: deal.jobId },
          'first-release window expired, auto-released the first milestone',
        );
        continue;
      }

      // Timer 2: final-release auto.
      if (deal.reviewWindowStartedAt && account.milestonesReleased >= 1) {
        const effectiveDeadline =
          deal.reviewWindowStartedAt +
          config.DEAL_REVIEW_WINDOW_MS +
          (deal.reviewExtensionMs ?? 0);
        if (now <= effectiveDeadline) continue;

        await releaseMilestone(deal.jobId, account.milestonesReleased);
        await finalizeIfSettled(deal.jobId);
        await patchDeal(deal.jobId, { autoReleasedAt: now, settledAt: Date.now() });
        bus.emitEvent({
          type: 'deal.auto_released',
          jobId: deal.jobId,
          actor: 'buyer',
          payload: { buyer: deal.buyer, seller: deal.seller },
        });
        logger.info(
          { jobId: deal.jobId },
          'final-release window expired, auto-released the final milestone',
        );
      }
    } catch (err) {
      logger.warn(
        { jobId: deal.jobId, err: (err as Error).message },
        'deal watcher action failed',
      );
    } finally {
      processing.delete(deal.jobId);
    }
  }
}

/// Starts the periodic auto-release watcher. Returns a stop function.
export function startDealWatcher(): () => void {
  if (!config.BUYER_AGENT_WALLET_ID) {
    logger.warn('BUYER_AGENT_WALLET_ID not set, deal watcher cannot auto-release');
  }
  const id = setInterval(() => {
    tick().catch((err) =>
      logger.error({ err: (err as Error).message }, 'deal watcher tick failed'),
    );
  }, TICK_MS);
  logger.info(
    {
      tickMs: TICK_MS,
      reviewWindowMs: config.DEAL_REVIEW_WINDOW_MS,
      extensionMs: config.DEAL_REVIEW_EXTENSION_MS,
    },
    'deal watcher started',
  );
  return () => clearInterval(id);
}
