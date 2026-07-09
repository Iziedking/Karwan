import { config } from '../config.js';
import { recordHeartbeat } from '../ops/heartbeats.js';
import { listAllDeals, patchDeal } from '../db/deals.js';
import { readEscrow } from '../chain/contracts.js';
import {
  releaseMilestone,
  finalizeIfSettled,
  disputeEscrow,
  refundEscrow,
  reclaimAfterDeadline,
  recordReputation,
  ESCROW_ACCEPTED,
  OUTCOME_FAILED,
} from '../chain/settlement.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

/// Deal lifecycle tick. Each tick reads on-chain escrow state for every
/// open deal; on a busy backend with many active deals that compounds the
/// RPC call volume. 60s is plenty of resolution for auto-release timing
/// (review windows are minutes-to-days, not seconds). Override via env
/// for paid RPC tiers that can afford tighter polling.
const TICK_MS = Number(process.env.DEAL_WATCHER_TICK_MS ?? 60_000);
const processing = new Set<string>();

type BlockReason = 'requirement-mismatch' | 'security-hold' | 'no-agent-wallet';

/// Auto-release window for the milestone at `index`. Each milestone doubles the
/// one before it: the buyer gets the base window to look at the first delivery,
/// twice that before the second tranche moves, and so on. Later tranches are
/// worth more and are harder to judge, so the buyer earns more time as the deal
/// progresses. The FINAL milestone is not on this ladder at all — it never
/// auto-releases (see below).
function milestoneWindowMs(index: number): number {
  return config.DEAL_REVIEW_WINDOW_MS * 2 ** index;
}

/// Record (once) that the agent has stopped the auto-release clock, and why.
/// Idempotent: re-entering the same reason on a later tick is a no-op, so the
/// event fires on the transition, not every 60s.
async function markBlocked(
  jobId: string,
  reason: BlockReason,
  current: BlockReason | undefined,
  parties: { buyer: string; seller: string },
) {
  if (current === reason) return;
  await patchDeal(jobId, { releaseBlockedReason: reason, releaseBlockedAt: Date.now() });
  bus.emitEvent({
    type: 'deal.release.blocked',
    jobId,
    actor: 'platform',
    payload: { ...parties, reason },
  });
  logger.info({ jobId, reason }, 'auto-release paused; both parties notified');
}

async function clearBlocked(jobId: string, parties: { buyer: string; seller: string }) {
  await patchDeal(jobId, { releaseBlockedReason: undefined, releaseBlockedAt: undefined });
  bus.emitEvent({
    type: 'deal.release.unblocked',
    jobId,
    actor: 'platform',
    payload: parties,
  });
  logger.info({ jobId }, 'auto-release resumed');
}

/// One pass over direct deals.
///
/// Auto-release covers the first milestone and any intermediate one, on the
/// doubling ladder in milestoneWindowMs(). The FINAL release never auto-fires
/// on a timer. The buyer must explicitly verify the work and click release. If
/// they stall, the seller raises a delay appeal and the agent settles on their
/// behalf when the buyer ignores it. This protects buyer funds from silent
/// settlement, which is the only real safety the escrow gives them at the last
/// gate.
///
/// Every path that declines to release must say so on the deal record. A
/// pause the seller cannot see is a deal that wedges forever.
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
    if (processing.has(deal.jobId)) continue;
    const parties = { buyer: deal.buyer, seller: deal.seller };
    // No buyer agent wallet means the agent physically cannot sign a release.
    // Surface it rather than skipping in silence; the parties still have the
    // manual release and the appeal path.
    if (!deal.buyerAgentWalletId) {
      await markBlocked(deal.jobId, 'no-agent-wallet', deal.releaseBlockedReason, parties);
      continue;
    }

    processing.add(deal.jobId);
    try {
      const account = await readEscrow(deal.jobId);
      // v2.D: the watcher acts on accepted-but-not-yet-released escrows.
      // Pre-v2.D this was Funded; after the seller's acceptEscrow lands
      // (which the deal-accept route invokes), the state moves to Accepted
      // and stays there until milestones are released.
      if (account.state !== ESCROW_ACCEPTED) continue;
      const buyerWalletId = deal.buyerAgentWalletId;

      // Two reasons the agent refuses to run the release clock:
      //
      //  - security-hold: a delivery link the scan flagged is withheld from the
      //    buyer, so the buyer can't review it. Releasing would pay a possibly
      //    malicious seller on a link the buyer never saw. Manual release is
      //    also blocked server-side (see the release route).
      //
      //  - requirement-mismatch: the SecurityAgent judged the delivery off-topic
      //    for the buyer's request. The proof IS shown (the buyer is the judge),
      //    but a clear mismatch must never settle on a timer without the buyer's
      //    explicit look. 'partial' is advisory only and does not pause.
      //
      // Both are recorded on the deal. The seller cannot see the buyer's private
      // deliveryMatch.reason, but they must see THAT the clock stopped, or they
      // wait forever on a countdown that already expired and never appeal.
      const blockReason: BlockReason | null =
        deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious'
          ? 'security-hold'
          : deal.deliveryMatch?.verdict === 'mismatch'
            ? 'requirement-mismatch'
            : null;
      if (blockReason) {
        await markBlocked(deal.jobId, blockReason, deal.releaseBlockedReason, parties);
        continue;
      }
      if (deal.releaseBlockedReason) {
        await clearBlocked(deal.jobId, parties);
      }

      // Deadline passed without delivery. The buyer's money is sitting in escrow
      // and the seller never delivered. First detection alerts the buyer (bell,
      // email, activity feed) that they can reclaim now or grant an extension.
      // If they take no action and the seller still has not delivered after the
      // grace window, auto-reclaim so the money is never stuck. The seller can
      // still deliver during grace, which clears this branch (deal.delivered).
      if (deal.deadlineUnix && !deal.delivered && now > deal.deadlineUnix * 1000) {
        if (!deal.deadlineAlertedAt) {
          await patchDeal(deal.jobId, { deadlineAlertedAt: now });
          bus.emitEvent({
            type: 'deal.deadline.passed',
            jobId: deal.jobId,
            actor: 'platform',
            payload: {
              buyer: deal.buyer,
              seller: deal.seller,
              deadlineUnix: deal.deadlineUnix,
              graceMs: config.DEAL_DEADLINE_RECLAIM_GRACE_MS,
            },
          });
          logger.info(
            { jobId: deal.jobId, deadlineUnix: deal.deadlineUnix },
            'delivery deadline passed without delivery, alerted buyer to reclaim',
          );
          continue;
        }
        if (now > deal.deadlineUnix * 1000 + config.DEAL_DEADLINE_RECLAIM_GRACE_MS) {
          const reason =
            'auto-reclaim: seller did not deliver by the deadline and the grace window passed';
          let refundTxHash: string;
          if (config.ESCROW_V2B_ENABLED) {
            // v2b: a single reclaimAfterDeadline settles it. It only lands if the
            // on-chain deadline + grace has actually passed (threaded at fund
            // time from the same deadlineUnix + reclaim grace) and records the
            // Failed outcome on chain atomically, so no separate dispute, refund,
            // or recordReputation call is needed. The inner-revert guard inside
            // the wrapper throws before the off-chain write if it didn't land.
            refundTxHash = await reclaimAfterDeadline(deal.jobId, buyerWalletId);
          } else {
            // v2.E: dispute then refund through the inner-revert guard so a
            // stuck on-chain state throws before the off-chain cancelled write,
            // never marking a deal refunded while the buyer's USDC is escrowed.
            await disputeEscrow(deal.jobId, buyerWalletId, reason);
            refundTxHash = await refundEscrow(deal.jobId, buyerWalletId);
          }
          await patchDeal(deal.jobId, {
            cancelledAt: Date.now(),
            cancelKind: 'unilateral',
            cancelReason: reason,
          });
          bus.emitEvent({
            type: 'deal.cancelled',
            jobId: deal.jobId,
            actor: 'platform',
            payload: {
              buyer: deal.buyer,
              seller: deal.seller,
              kind: 'unilateral',
              reason,
              txHash: refundTxHash,
              auto: true,
            },
          });
          // v2b records Failed on chain inside reclaimAfterDeadline; only the
          // v2.E path needs the explicit off-chain-signed reputation write.
          if (!config.ESCROW_V2B_ENABLED) {
            await recordReputation(deal.jobId, buyerWalletId, OUTCOME_FAILED);
          }
          logger.info(
            { jobId: deal.jobId },
            'reclaim grace window passed, auto-reclaimed escrow to the buyer',
          );
        }
        continue;
      }

      const totalMilestones = account.milestonePcts.length || 2;
      const nextIndex = account.milestonesReleased;
      const nextIsFinal = nextIndex + 1 >= totalMilestones;

      // Self-heal. The chain says a milestone is out, but the off-chain review
      // window was never stamped — a release tx that landed while the write
      // behind it did not. Both the seller's delay appeal and the buyer's panel
      // key off reviewWindowStartedAt, so a deal in this state can never settle
      // and neither side can act. The chain is truth; backfill from it.
      if (nextIndex >= 1 && !deal.reviewWindowStartedAt) {
        const startedAt = deal.lastReleaseAt ?? now;
        await patchDeal(deal.jobId, { reviewWindowStartedAt: startedAt });
        logger.warn(
          { jobId: deal.jobId, milestonesReleased: nextIndex },
          'chain shows a released milestone with no review window; backfilled from chain',
        );
      }

      // Timer ladder. The first milestone and any intermediate one auto-release
      // once their window elapses; each window is double the one before it. The
      // FINAL milestone is never on this ladder — see the delay-appeal branch.
      if (deal.delivered && deal.deliveredAt && !nextIsFinal) {
        const anchor =
          nextIndex === 0
            ? deal.deliveredAt
            : (deal.lastReleaseAt ?? deal.reviewWindowStartedAt ?? deal.deliveredAt);
        const windowMs = milestoneWindowMs(nextIndex);
        if (now <= anchor + windowMs) continue;
        await releaseMilestone(deal.jobId, nextIndex, buyerWalletId);
        const releasedAt = Date.now();
        await patchDeal(deal.jobId, {
          lastReleaseAt: releasedAt,
          ...(nextIndex === 0
            ? { reviewWindowStartedAt: releasedAt, firstAutoReleased: true }
            : {}),
        });
        bus.emitEvent(
          nextIndex === 0
            ? {
                type: 'deal.review.started',
                jobId: deal.jobId,
                actor: 'buyer',
                payload: {
                  buyer: deal.buyer,
                  seller: deal.seller,
                  windowMs,
                  startedAt: releasedAt,
                  auto: true,
                },
              }
            : {
                type: 'deal.milestone.auto_released',
                jobId: deal.jobId,
                actor: 'buyer',
                payload: {
                  buyer: deal.buyer,
                  seller: deal.seller,
                  index: nextIndex,
                  windowMs,
                  releasedAt,
                },
              },
        );
        logger.info(
          { jobId: deal.jobId, index: nextIndex, windowMs },
          'milestone window expired, auto-released',
        );
        continue;
      }

      // Final release: buyer-only by default, BUT if the seller raised a
      // delay appeal and the buyer didn't respond within the window, the
      // agent auto-releases on the seller's behalf. Protects sellers from
      // indefinite buyer silence without surprising the buyer mid-review.
      //
      // Only the FINAL milestone may auto-release this way, so the delay appeal
      // can only force the very last tranche once everything before it is out.
      // On a two-part deal this is exactly the prior behaviour.
      const responseDeadline =
        deal.delayAppealRaisedAt && deal.delayAppealRaisedAt > (deal.delayAppealRespondedAt ?? 0)
          ? deal.delayAppealRaisedAt + config.DEAL_DELAY_APPEAL_RESPONSE_MS
          : null;
      if (
        nextIndex >= 1 &&
        nextIsFinal &&
        responseDeadline !== null &&
        now > responseDeadline
      ) {
        await releaseMilestone(deal.jobId, nextIndex, buyerWalletId);
        const settled = await finalizeIfSettled(deal.jobId);
        await patchDeal(deal.jobId, {
          autoReleasedAt: now,
          lastReleaseAt: Date.now(),
          ...(settled ? { settledAt: Date.now() } : {}),
        });
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
    recordHeartbeat('dealWatcher');
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
