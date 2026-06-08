import { config } from '../config.js';
import { listAllDeals, patchDeal } from '../db/deals.js';
import { readEscrow } from '../chain/contracts.js';
import { releaseMilestone, finalizeIfSettled, ESCROW_ACCEPTED } from '../chain/settlement.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

/// Deal lifecycle tick. Each tick reads on-chain escrow state for every
/// open deal; on a busy backend with many active deals that compounds the
/// RPC call volume. 60s is plenty of resolution for auto-release timing
/// (review windows are minutes-to-days, not seconds). Override via env
/// for paid RPC tiers that can afford tighter polling.
const TICK_MS = Number(process.env.DEAL_WATCHER_TICK_MS ?? 60_000);
const processing = new Set<string>();

/// One pass over direct deals. Only ONE timer auto-releases now:
///  - First-release: the seller has marked delivered but the buyer has not
///    released the first milestone within the review window. The agent
///    releases it and opens the verification stage.
///
/// The FINAL release never auto-fires. The buyer must explicitly verify the
/// work and click release. If they stall, the seller can appeal for delay (a
/// separate path). This protects buyer funds from silent settlement, which is
/// the only real safety the escrow gives them at the last gate.
async function tick() {
  const now = Date.now();
  for (const deal of await listAllDeals()) {
    if (deal.disputed || deal.cancelledAt || deal.settledAt) continue;
    // Acceptance window expiry. Seller never accepted in time. Mark cancelled
    // with kind 'pre-accept' so reputation isn't touched on either side; the
    // buyer is freed up to open a fresh deal elsewhere.
    if (
      !deal.acceptedAt &&
      deal.acceptanceDeadlineUnix &&
      now > deal.acceptanceDeadlineUnix * 1000
    ) {
      await patchDeal(deal.jobId, {
        cancelledAt: now,
        cancelKind: 'pre-accept',
        cancelReason: 'acceptance window expired with no seller acceptance',
      });
      bus.emitEvent({
        type: 'deal.acceptance.expired',
        jobId: deal.jobId,
        actor: 'platform',
        payload: {
          buyer: deal.buyer,
          seller: deal.seller,
          acceptanceDeadlineUnix: deal.acceptanceDeadlineUnix,
        },
      });
      logger.info(
        { jobId: deal.jobId, acceptanceDeadlineUnix: deal.acceptanceDeadlineUnix },
        'acceptance window expired, marking deal cancelled (pre-accept)',
      );
      continue;
    }
    // No escrow exists until the seller accepts, so there is nothing to watch.
    if (!deal.acceptedAt) continue;
    if (!deal.buyerAgentWalletId) continue;
    if (processing.has(deal.jobId)) continue;

    processing.add(deal.jobId);
    try {
      const account = await readEscrow(deal.jobId);
      // v2.D: the watcher acts on accepted-but-not-yet-released escrows.
      // Pre-v2.D this was Funded; after the seller's acceptEscrow lands
      // (which the deal-accept route invokes), the state moves to Accepted
      // and stays there until milestones are released.
      if (account.state !== ESCROW_ACCEPTED) continue;
      const buyerWalletId = deal.buyerAgentWalletId;

      // Timer 1: first-release auto.
      const firstWindowOpen =
        deal.delivered &&
        !!deal.deliveredAt &&
        !deal.reviewWindowStartedAt &&
        account.milestonesReleased === 0;
      if (firstWindowOpen) {
        if (now <= deal.deliveredAt! + config.DEAL_REVIEW_WINDOW_MS) continue;
        await releaseMilestone(deal.jobId, 0, buyerWalletId);
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

      // Final release: buyer-only by default, BUT if the seller raised a
      // delay appeal and the buyer didn't respond within the window, the
      // agent auto-releases on the seller's behalf. Protects sellers from
      // indefinite buyer silence without surprising the buyer mid-review.
      const responseDeadline =
        deal.delayAppealRaisedAt && deal.delayAppealRaisedAt > (deal.delayAppealRespondedAt ?? 0)
          ? deal.delayAppealRaisedAt + config.DEAL_DELAY_APPEAL_RESPONSE_MS
          : null;
      if (
        account.milestonesReleased >= 1 &&
        responseDeadline !== null &&
        now > responseDeadline
      ) {
        await releaseMilestone(deal.jobId, account.milestonesReleased, buyerWalletId);
        await finalizeIfSettled(deal.jobId);
        await patchDeal(deal.jobId, { autoReleasedAt: now, settledAt: Date.now() });
        bus.emitEvent({
          type: 'deal.delay.auto_released',
          jobId: deal.jobId,
          actor: 'buyer',
          payload: { buyer: deal.buyer, seller: deal.seller, raisedAt: deal.delayAppealRaisedAt },
        });
        logger.info(
          { jobId: deal.jobId, raisedAt: deal.delayAppealRaisedAt },
          'delay appeal response window passed, auto-released the final milestone',
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

/// Starts the periodic auto-release watcher. Returns a stop function. Each deal
/// carries its own buyer agent wallet; deals without one are skipped.
export function startDealWatcher(): () => void {
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
