import { deliveryCheckDetail, type DeliveryCheckDetail } from '../deals/deliveryCheck.js';
import { runDisputeJudge, type DisputeJudgeDeps } from '../deals/disputeJudgeRunner.js';
import { rulingSchema, statementRemindersDue } from '../deals/disputeJudge.js';
import { listMessages } from '../db/messages.js';
import { addSystemMessage } from '../chat/systemMessages.js';
import { generateObjectWithLlmFallback } from '../llm/client.js';
import { keccak256, toBytes } from 'viem';
import { config } from '../config.js';
import { recordHeartbeat } from '../ops/heartbeats.js';
import { listAllDeals, patchDeal, type DirectDeal } from '../db/deals.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { appendActivity } from '../db/activityLog.js';
import { escrow, readEscrow } from '../chain/contracts.js';
import {
  disputeEscrow,
  refundEscrow,
  resolveDispute,
  recordReputation,
  ESCROW_ACCEPTED,
  ESCROW_DISPUTED,
  ESCROW_FUNDED,
  ESCROW_REFUNDED,
  OUTCOME_FAILED,
} from '../chain/settlement.js';
import { bus } from '../events.js';
import { settleFactoringForDeal } from './factoringWatcher.js';
import { settlePOFinancingForDeal } from './poWatcher.js';
import { dealEscrowOps, escrowAddressOf } from '../deals/dealEscrowOpsLive.js';
import { runV3Attestation, runV3Dispute } from './v3DisputeWatcher.js';
import { v3WatcherDeps } from './v3DisputeWatcherLive.js';
import { logger } from '../logger.js';
import {
  releaseBlockReasonForDelivery,
  type ReleaseBlockReason,
} from '../deals/releaseBlock.js';
import { readEvidenceReceipt } from '../chain/evidenceReceipt.js';
import {
  autoReleaseWindowMs,
  buildPairHistory,
  milestoneWindowAnchor,
  pairKey,
} from '../deals/releaseWindow.js';
import { manualReviewActive } from '../deals/evidenceManualReview.js';
import { sellerAgreementExpired } from '../deals/lifecycle.js';
import {
  ensureEscrowRefundMovement,
  executeEscrowRefundMovement,
  escrowBuyerRefundMicros,
} from '../money/escrowRefund.js';
import { formatUsdcMicros } from '../money/model.js';
import { getMoneyMovementByOperationKey } from '../db/moneyMovements.js';
import { shouldResumePendingRefund } from '../deals/pendingRefund.js';
import { expectedMilestonePayout } from '../money/escrowProjection.js';
import {
  claimDeadlineRecovery,
  completeDeadlineRecovery,
  deadlineRecoveryBackoffMs,
  deadlineRecoveryReadyAt,
  ensureDeadlineRecovery,
  failDeadlineRecovery,
  recordDeadlineRecoveryMovement,
} from '../deals/deadlineRecovery.js';
import type { FinancialCommandShadowObserver } from './financialCommandShadow.js';
import { buildLegacySettlementObservation } from './financialCommandProjection.js';
import { onChainDeliveryAlert } from '../deals/onChainDelivery.js';
import { sendTelegramMessage, supportOperatorChatId } from '../telegram/bot.js';
import { timeoutRuling } from '../deals/disputeTimeout.js';
import { runDeadlineRule, deadlineRulingHash, type DeadlineRuleDeps } from '../deals/deadlineRuleRunner.js';
import { sellerRespondedAfterDispute } from '../deals/sellerResponse.js';

/// Auto-release used to be gated on `poPrincipalStillHeld`, which blocked the
/// unattended path while a PO line still held the seller's principal in the old
/// financing contract's custody. That contract assigned the escrow payout to the
/// financier at fund time but only released the principal on a proof-of-delivery
/// anchor the ordinary milestone path never wrote, so a deal settling on the
/// timer paid the financier out of the escrow while the seller had nothing.
///
/// The guard is gone because both halves of the exposure are gone. The current
/// rail pays the seller inside the funding transaction, so it cannot reach that
/// state at all. And the retired contract (0xf14b41BD…) holds no USDC and has had
/// its escrow assigner revoked, so it can neither strand anything nor open a new
/// line. Kept only as a note: a stale DB row would now block auto-release forever
/// while protecting nothing, which is why leaving the guard in was the riskier
/// option. See contracts/test/KarwanPOCustodyAttack.t.sol.

/// Deal lifecycle tick. Each tick reads on-chain escrow state for every
/// open deal; on a busy backend with many active deals that compounds the
/// RPC call volume. 60s is plenty of resolution for auto-release timing
/// (review windows are minutes-to-days, not seconds). Override via env
/// for paid RPC tiers that can afford tighter polling.
const TICK_MS = Number(process.env.DEAL_WATCHER_TICK_MS ?? 60_000);
const processing = new Set<string>();
const refundMovementKey = (jobId: string) => `escrow_refund:${jobId.toLowerCase()}`;

let financialCommandShadowObserver: FinancialCommandShadowObserver | null = null;

/**
 * Installs the optional read-only settlement observer. It receives projected
 * payout/refund intents only; it cannot call a provider or alter the watcher.
 */
export function configureDealFinancialCommandShadow(
  observer: FinancialCommandShadowObserver | null,
): () => void {
  financialCommandShadowObserver = observer;
  return () => {
    if (financialCommandShadowObserver === observer) financialCommandShadowObserver = null;
  };
}

function publishSettlementShadow(input: Parameters<typeof buildLegacySettlementObservation>[0]): void {
  const observer = financialCommandShadowObserver;
  if (!observer) return;
  try {
    const data = buildLegacySettlementObservation(input);
    void observer({ data }).catch((err) => {
      logger.warn(
        { jobId: input.dealRoomId, operation: input.operation, err: (err as Error).message },
        'legacy settlement financial shadow observation failed',
      );
    });
  } catch (err) {
    logger.warn(
      { jobId: input.dealRoomId, operation: input.operation, err: (err as Error).message },
      'legacy settlement financial shadow projection rejected',
    );
  }
}

function publishMilestonePayoutShadow(
  deal: DirectDeal,
  account: Parameters<typeof expectedMilestonePayout>[0],
  milestoneIndex: number,
  observedAtUnix: number,
): void {
  if (!deal.sellerAgentAddress) return;
  try {
    publishSettlementShadow({
      dealRoomId: deal.jobId,
      escrowAddress: escrow.address,
      destinationAddress: deal.sellerAgentAddress,
      amountUsdc: formatUsdcMicros(expectedMilestonePayout(account, milestoneIndex)),
      operation: 'MILESTONE_PAYOUT',
      observedAtUnix,
      movementReference: `release:${deal.jobId}:milestone:${milestoneIndex}`,
    });
  } catch (err) {
    logger.warn(
      { jobId: deal.jobId, milestoneIndex, err: (err as Error).message },
      'legacy milestone payout shadow projection rejected',
    );
  }
}

type BlockReason = ReleaseBlockReason;

/// Record (once) that the agent has stopped the auto-release clock, and why.
/// Idempotent: re-entering the same reason on a later tick is a no-op, so the
/// event fires on the transition, not every 60s.
async function markBlocked(
  jobId: string,
  reason: BlockReason,
  detail: DeliveryCheckDetail | null,
  current: { reason?: BlockReason; detail?: DeliveryCheckDetail },
  parties: { buyer: string; seller: string },
) {
  // A new reason, or a new explanation of the same block, is news to both
  // sides; the same block seen again on the next tick is not.
  if (current.reason === reason && current.detail === (detail ?? undefined)) return;
  await patchDeal(jobId, { releaseBlockedReason: reason, releaseBlockedDetail: detail ?? undefined, releaseBlockedAt: Date.now() });
  bus.emitEvent({
    type: 'deal.release.blocked',
    jobId,
    actor: 'platform',
    payload: { ...parties, reason, ...(detail ? { detail } : {}) },
  });
  logger.info({ jobId, reason }, 'auto-release paused; both parties notified');
}

async function clearBlocked(jobId: string, parties: { buyer: string; seller: string }) {
  await patchDeal(jobId, { releaseBlockedReason: undefined, releaseBlockedDetail: undefined, releaseBlockedAt: undefined });
  bus.emitEvent({
    type: 'deal.release.unblocked',
    jobId,
    actor: 'platform',
    payload: parties,
  });
  logger.info({ jobId }, 'auto-release resumed');
}

/// The chain says this dispute already ended out-of-band (manual arbiter call,
/// accepted proposal). Sync the record with the OUTCOME the chain reports: a
/// Refunded escrow reads as a dispute-refund cancel, anything else as settled —
/// stamping settledAt on a refunded deal would show "settled" for money that
/// went back to the buyer.
async function syncResolvedElsewhere(deal: DirectDeal, chainState: number) {
  if (chainState === ESCROW_REFUNDED) {
    await patchDeal(deal.jobId, {
      cancelledAt: Date.now(),
      cancelKind: 'refund-from-dispute',
      cancelReason: 'dispute resolved on chain outside the watcher',
    });
  } else {
    await patchDeal(deal.jobId, { settledAt: Date.now() });
  }
}

/// Backstop for a dispute whose counterparty went silent. A dispute can only
/// leave the Disputed state two ways: the other side accepts a proposal (they
/// have to click), or the arbiter resolve()s it (a manual admin action). If
/// neither happens the escrow is frozen forever. Once a dispute is older than
/// DEAL_DISPUTE_TIMEOUT_MS, resolve it automatically via the same arbiter path
/// the admin console uses: the seller keeps the unreleased funds if they
/// delivered (the reported case — real work, buyer vanished), otherwise the
/// buyer is refunded. A delivery the guard check failed counts as no delivery
/// (deals/disputeTimeout.ts). No-ops unless a security-council wallet is configured.
/// v3 disputes: automatic proposal or escalation, execution after the appeal
/// window, lapse after the timeout. One step per tick; a failure retries next
/// tick and never blocks other deals.
async function runV3DisputeSafely(deal: DirectDeal, now: number) {
  const deps = v3WatcherDeps();
  if (!deps || processing.has(deal.jobId)) return;
  processing.add(deal.jobId);
  try {
    await runV3Dispute(deps, deal, now);
  } catch (err) {
    logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'v3 dispute step failed (retried next tick)');
  } finally {
    processing.delete(deal.jobId);
  }
}

/// Deadline passed without delivery. The buyer's money is sitting in escrow
/// and the seller never delivered. First detection alerts the buyer (bell,
/// email, activity feed) that they can reclaim now or grant an extension.
/// If they take no action and the seller still has not delivered after the
/// grace window, auto-reclaim so the money is never stuck. The seller can
/// still deliver during grace, which clears this branch (deal.delivered).
///
/// Runs on Accepted escrows and on Funded ones the seller never accepted on
/// chain. An agent deal is accepted on chain only when the seller delivers, so
/// a seller who never delivers leaves it Funded, and skipping Funded left the
/// buyer's money waiting on a button. Accepted on the per-deal clock reclaims
/// in one call; anything else disputes, then refunds. Returns true when the
/// deadline branch owns this tick.
async function maybeReclaimAfterDeadline(
  deal: DirectDeal,
  account: Awaited<ReturnType<typeof dealEscrowOps.read>>,
  now: number,
): Promise<boolean> {
  if (!deal.deadlineUnix || deal.delivered || now <= deal.deadlineUnix * 1000) return false;
  const buyerWalletId = deal.buyerAgentWalletId!;
  const onChainReclaim = dealEscrowOps.usesOnChainClock(deal) && account.state === ESCROW_ACCEPTED;
  const recovery = await ensureDeadlineRecovery({
    jobId: deal.jobId,
    deadlineUnix: deal.deadlineUnix,
    availableAt: deadlineRecoveryReadyAt(
      deal.deadlineUnix,
      config.DEAL_DEADLINE_RECLAIM_GRACE_MS,
    ),
    now,
  });
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
    return true;
  }
  const recoveryLease =
    now >= recovery.availableAt
      ? await claimDeadlineRecovery({ jobId: deal.jobId, now })
      : null;
  if (recoveryLease) {
    const reason =
      'auto-reclaim: seller did not deliver by the deadline and the grace window passed';
    try {
      const buyerAgentAddress =
        deal.buyerAgentAddress ?? (await getAgentWallets(deal.buyer))?.buyerAddress;
      if (!buyerAgentAddress) throw new Error('buyer agent address missing');
      const refundMicros = escrowBuyerRefundMicros(account);
      if (refundMicros <= 0n) throw new Error('escrow has no remaining balance');
      const refundAmountUsdc = formatUsdcMicros(refundMicros);
      publishSettlementShadow({
        dealRoomId: deal.jobId,
        escrowAddress: escrowAddressOf(deal),
        destinationAddress: buyerAgentAddress,
        amountUsdc: refundAmountUsdc,
        operation: 'REFUND',
        observedAtUnix: Math.floor(now / 1_000),
        movementReference: refundMovementKey(deal.jobId),
      });
      const refundInput = {
        operationKey: refundMovementKey(deal.jobId),
        amountUsdc: refundAmountUsdc,
        initiatedBy: deal.buyer,
        buyerAgentAddress,
        sellerAddress: deal.seller,
        jobId: deal.jobId,
        summary: `Reclaimed ${refundAmountUsdc} USDC from the deal the seller did not deliver`,
        escrowAddress: escrowAddressOf(deal),
        buyerAgentWalletId: buyerWalletId,
      };
      const ensuredRefund = await ensureEscrowRefundMovement(refundInput);
      await recordDeadlineRecoveryMovement(
        recoveryLease,
        ensuredRefund.movement.reference,
      );
      let refundResult;
      if (onChainReclaim) {
        // v2b and v3: a single reclaim settles it. It only lands if
        // the on-chain deadline + grace has passed and records Failed on
        // chain atomically, so no separate dispute, refund, or reputation
        // write is needed. The wrapper throws before the off-chain write
        // if the transaction did not land.
        refundResult = await executeEscrowRefundMovement(refundInput, (options) =>
          dealEscrowOps.reclaim(deal, buyerWalletId, options),
        );
      } else {
        // v2.E: dispute then refund through the inner-revert guard so a
        // stuck on-chain state throws before the off-chain cancelled write,
        // never marking a deal refunded while the buyer's USDC is escrowed.
        if (account.state !== ESCROW_DISPUTED) {
          await disputeEscrow(deal.jobId, buyerWalletId, reason);
        }
        refundResult = await executeEscrowRefundMovement(refundInput, (options) =>
          refundEscrow(deal.jobId, buyerWalletId, options),
        );
      }
      const refundTxHash = refundResult.txHash;
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
          reference: refundResult.movement.reference,
          auto: true,
        },
      });
      void appendActivity({
        id: `escrow-refund:${deal.jobId}`,
        address: deal.buyer,
        kind: 'refund',
        refId: refundResult.movement.reference,
        summary: refundInput.summary,
        params: {
          t: 'deadlineReclaim',
          amount: refundAmountUsdc,
          reference: refundResult.movement.reference,
        },
        amountUsdc: refundAmountUsdc,
        txHash: refundTxHash,
        jobId: deal.jobId,
        counterparty: deal.seller.toLowerCase(),
      });
      // v2b and v3 record Failed on chain inside the reclaim. Only the
      // v2.E path needs the explicit off-chain reputation write.
      if (!onChainReclaim) {
        await recordReputation(deal.jobId, buyerWalletId, OUTCOME_FAILED);
      }
      try {
        await completeDeadlineRecovery(recoveryLease, {
          movementReference: refundResult.movement.reference,
          txHash: refundTxHash,
        });
      } catch (recoveryError) {
        logger.error(
          { jobId: deal.jobId, err: (recoveryError as Error).message },
          'refund completed but recovery ledger could not be finalized',
        );
      }
      logger.info(
        { jobId: deal.jobId, recoveryAttempt: recovery.attempt + 1 },
        'reclaim grace window passed, auto-reclaimed escrow to the buyer',
      );
    } catch (err) {
      try {
        await failDeadlineRecovery(recoveryLease, {
          error: (err as Error).message,
          nextAvailableAt: now + deadlineRecoveryBackoffMs(recovery.attempt + 1),
          now,
        });
      } catch (recoveryError) {
        logger.error(
          { jobId: deal.jobId, err: (recoveryError as Error).message },
          'refund failed and recovery ledger could not record the retry',
        );
      }
      throw err;
    }
  }
  return true;
}

/// Finishes a buyer's deadline cancel whose refund step never landed, on a deal
/// the seller never accepted (see deals/pendingRefund.ts). Same movement key,
/// same recovery ledger and the same off-chain writes as the cancel route, so a
/// retry here and a retry from the buyer's button can never both pay out.
async function maybeResumePendingRefund(
  deal: DirectDeal,
  account: Awaited<ReturnType<typeof dealEscrowOps.read>>,
  now: number,
) {
  const refund = await getMoneyMovementByOperationKey(refundMovementKey(deal.jobId));
  const resume = shouldResumePendingRefund({
    deal,
    escrow: { disputed: true, wasAccepted: account.wasAccepted, version: account.version },
    refund: refund ? { state: refund.state, initiatedBy: refund.initiatedBy } : null,
  });
  if (!resume || !refund || !deal.deadlineUnix) return;
  const amountUsdc = formatUsdcMicros(BigInt(refund.amountMicros));
  const recipient = refund.participants.find((p) => p.role === 'recipient')?.address;
  if (!recipient) return;
  const buyerWalletId = deal.buyerAgentWalletId!;
  const recovery = await ensureDeadlineRecovery({
    jobId: deal.jobId,
    deadlineUnix: deal.deadlineUnix,
    availableAt: deadlineRecoveryReadyAt(deal.deadlineUnix, config.DEAL_DEADLINE_RECLAIM_GRACE_MS),
    now,
  });
  if (now < recovery.availableAt) return;
  const lease = await claimDeadlineRecovery({ jobId: deal.jobId, now });
  if (!lease) return;
  const reason = 'buyer cancel: seller did not deliver by deadline';
  const refundInput = {
    operationKey: refundMovementKey(deal.jobId),
    amountUsdc,
    initiatedBy: deal.buyer,
    buyerAgentAddress: recipient,
    sellerAddress: deal.seller,
    jobId: deal.jobId,
    summary: refund.summary,
    escrowAddress: escrowAddressOf(deal),
    buyerAgentWalletId: buyerWalletId,
  };
  try {
    await recordDeadlineRecoveryMovement(lease, refund.reference);
    const result = await executeEscrowRefundMovement(refundInput, (options) =>
      refundEscrow(deal.jobId, buyerWalletId, options),
    );
    await patchDeal(deal.jobId, {
      cancelledAt: Date.now(),
      cancelKind: 'unilateral',
      cancelReason: reason,
      refundTxHash: result.txHash,
    });
    void appendActivity({
      address: deal.buyer,
      kind: 'refund',
      id: `escrow-refund:${deal.jobId}`,
      refId: result.movement.reference,
      summary: refund.summary,
      params: { t: 'deadlineReclaim', amount: amountUsdc, reference: result.movement.reference },
      amountUsdc,
      txHash: result.txHash,
      jobId: deal.jobId,
      counterparty: deal.seller?.toLowerCase(),
    });
    bus.emitEvent({
      type: 'deal.cancelled',
      jobId: deal.jobId,
      actor: 'buyer',
      payload: { buyer: deal.buyer, seller: deal.seller, kind: 'unilateral', reason, txHash: result.txHash, reference: result.movement.reference, auto: true },
    });
    await recordReputation(deal.jobId, buyerWalletId, OUTCOME_FAILED);
    await completeDeadlineRecovery(lease, { movementReference: result.movement.reference, txHash: result.txHash });
    logger.info({ jobId: deal.jobId, txHash: result.txHash }, 'resumed a buyer refund that never landed');
  } catch (err) {
    await failDeadlineRecovery(lease, {
      error: (err as Error).message,
      nextAvailableAt: Date.now() + deadlineRecoveryBackoffMs(recovery.attempt + 1),
      now: Date.now(),
    }).catch((recoveryError) =>
      logger.error({ jobId: deal.jobId, err: (recoveryError as Error).message }, 'refund resume failed and the retry could not be recorded'),
    );
    logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'resuming a pending buyer refund failed; will retry');
  }
}

async function maybeAutoResolveDispute(deal: DirectDeal, now: number) {
  // v3 disputes run through the v3 arbiter (proposeRuling, executeRuling,
  // lapse), never the v2 resolver.
  if (dealEscrowOps.isV3(deal)) return;
  if (!config.ESCROW_V2B_ENABLED) return;
  // A pending proposal means someone is actively negotiating an exit — that is
  // not a silent counterparty. Let the handshake play out; the clock resumes
  // when the proposal is accepted (deal closes) or declined (field cleared).
  if (deal.cancellationProposal) return;
  if (processing.has(deal.jobId)) return;
  if (!deal.disputedAt) {
    // Legacy dispute recorded before disputedAt existed: without a stamp the
    // timeout could never fire, silently defeating this backstop. Backfill from
    // the on-chain clock (v2b exposes disputedAt) or the nearest off-chain
    // milestone; the next tick evaluates the timeout against it.
    processing.add(deal.jobId);
    try {
      const account = await readEscrow(deal.jobId);
      if (account.state !== ESCROW_DISPUTED) {
        await syncResolvedElsewhere(deal, account.state);
        return;
      }
      const chainMs = account.disputedAt ? Number(account.disputedAt) * 1000 : 0;
      const backfill = chainMs > 0 ? chainMs : (deal.deliveredAt ?? deal.acceptedAt ?? now);
      await patchDeal(deal.jobId, { disputedAt: backfill });
      logger.info({ jobId: deal.jobId, backfill }, 'legacy dispute missing disputedAt; backfilled');
    } catch (err) {
      logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'disputedAt backfill failed');
    } finally {
      processing.delete(deal.jobId);
    }
    return;
  }
  if (now < deal.disputedAt + config.DEAL_DISPUTE_TIMEOUT_MS) return;
  // Two cases go to the human arbiter (once) instead of a timer:
  //  - a buyer who disputed delivered work was engaged, not silent, and paying
  //    the seller 100% on a timer would expropriate them for not capitulating;
  //  - no council wallet can sign. The arbiter is a Safe, so only its owners
  //    can rule, and the contract lets either party lapse the dispute once
  //    disputeTimeoutSecs passes. Silence here is how a dispute gets lost.
  if ((deal.disputedBy === 'buyer' && deal.delivered) || !config.SECURITY_COUNCIL_WALLET_ID) {
    if (!deal.disputeTimeoutAlertedAt) {
      await patchDeal(deal.jobId, { disputeTimeoutAlertedAt: now });
      bus.emitEvent({
        type: 'deal.dispute.needs_arbiter',
        jobId: deal.jobId,
        actor: 'platform',
        payload: { buyer: deal.buyer, seller: deal.seller, disputedAt: deal.disputedAt },
      });
      logger.warn({ jobId: deal.jobId }, 'dispute passed the dispute window; flagged for the arbiter');
      const chat = supportOperatorChatId();
      if (chat) {
        const days = Math.floor((now - deal.disputedAt) / 86_400_000);
        await sendTelegramMessage(
          chat,
          `*Dispute needs the arbiter.* Deal ${deal.jobId.slice(0, 10)}… has been disputed for ${days} days. ` +
            `Two Safe owners must rule at /admin/disputes before either party can lapse it on chain.`,
        ).catch((err) => logger.warn({ err: (err as Error).message }, 'arbiter alert send failed'));
      }
    }
    return;
  }
  processing.add(deal.jobId);
  try {
    // The off-chain `disputed` flag can lag a manual resolve or an accepted
    // proposal, so confirm the chain is still Disputed before signing.
    const account = await readEscrow(deal.jobId);
    if (account.state !== ESCROW_DISPUTED) {
      await syncResolvedElsewhere(deal, account.state);
      return;
    }
    // A delivery the guard check failed is refunded, never paid, on the timer.
    const { sellerBps, reason } = timeoutRuling(deal);
    const txHash = await resolveDispute(deal.jobId, sellerBps, keccak256(toBytes(reason)));
    await patchDeal(deal.jobId, {
      settledAt: Date.now(),
      cancelKind: 'resolved',
      cancelReason: reason,
      resolvedSellerBps: sellerBps,
      disputeLoser: sellerBps >= 5000 ? 'buyer' : 'seller',
    });
    // Seller got paid: pull any financing repayment now instead of next tick.
    if (sellerBps > 0) {
      void settleFactoringForDeal(deal.jobId);
      void settlePOFinancingForDeal(deal.jobId);
    }
    bus.emitEvent({
      type: 'deal.dispute.auto_resolved',
      jobId: deal.jobId,
      actor: 'platform',
      payload: { buyer: deal.buyer, seller: deal.seller, sellerBps, reason, txHash },
    });
    logger.info(
      { jobId: deal.jobId, sellerBps, txHash },
      'dispute timeout passed with a silent counterparty, auto-resolved via arbiter',
    );
  } catch (err) {
    logger.warn(
      { jobId: deal.jobId, err: (err as Error).message },
      'dispute auto-resolve failed',
    );
  } finally {
    processing.delete(deal.jobId);
  }
}

/// One pass over direct deals.
///
/// Auto-release covers the first milestone and any intermediate one, on the
/// window from autoReleaseWindowMs(). The FINAL release never auto-fires
/// on a timer. The buyer must explicitly verify the work and click release. If
/// they stall, the seller raises a delay appeal and the agent settles on their
/// behalf when the buyer ignores it. This protects buyer funds from silent
/// settlement, which is the only real safety the escrow gives them at the last
/// gate.
///
/// Every path that declines to release must say so on the deal record. A
/// pause the seller cannot see is a deal that wedges forever.
const deadlineRuleDeps: DeadlineRuleDeps = {
  readState: async (jobId) => (await readEscrow(jobId)).state,
  openDispute: (jobId, walletId, reason) => disputeEscrow(jobId, walletId, reason),
  resolveRefund: (jobId, reason) => resolveDispute(jobId, 0, deadlineRulingHash(reason)),
  patchDeal: (jobId, patch) => patchDeal(jobId, patch),
  emit: (event) => bus.emitEvent(event as Parameters<typeof bus.emitEvent>[0]),
  sellerRespondedAfterDispute,
};

/// The owner's deadline rules (v2 only, behind DISPUTE_DEADLINE_RULE_ENABLED).
/// True when the rule acted, so the caller skips the rest of the tick for it.
async function maybeApplyDeadlineRule(deal: DirectDeal, now: number): Promise<boolean> {
  if (!config.DISPUTE_DEADLINE_RULE_ENABLED || dealEscrowOps.isV3(deal) || processing.has(deal.jobId)) return false;
  processing.add(deal.jobId);
  try {
    const outcome = await runDeadlineRule(deal, now, deadlineRuleDeps, {
      graceMs: config.DEAL_DEADLINE_RECLAIM_GRACE_MS,
      statementWindowMs: config.DISPUTE_STATEMENT_WINDOW_MS,
    });
    if (outcome !== 'none') logger.info({ jobId: deal.jobId, outcome }, 'deadline rule acted');
    return outcome !== 'none';
  } catch (err) {
    logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'deadline rule failed (retried next tick)');
    return true;
  } finally {
    processing.delete(deal.jobId);
  }
}

const disputeJudgeDeps: DisputeJudgeDeps = {
  listMessages: (jobId) => listMessages(jobId),
  generate: async (prompt) => {
    const result = await generateObjectWithLlmFallback({ schema: rulingSchema, prompt });
    return { object: result.object, model: result.response?.modelId ?? 'unknown' };
  },
  patchDeal: (jobId, patch) => patchDeal(jobId, patch),
  postSystem: async (eventType, deal, now) => {
    await addSystemMessage({
      jobId: deal.jobId,
      channel: 'trade',
      channelKey: deal.jobId,
      eventType,
      occurrenceKey: `${eventType}:${now}`,
      body: 'The judge proposed a ruling. A reviewer confirms it before any money moves.',
    });
  },
  notifyReviewer: (deal) => {
    const opChat = supportOperatorChatId();
    if (opChat === null) return;
    const base = config.FRONTEND_BASE_URL?.replace(/\/$/, '');
    void sendTelegramMessage(
      opChat,
      `*Dispute ruling proposed*\nAmount: ${deal.dealAmountUsdc} USDC\nJob: \`${deal.jobId.slice(0, 10)}…\`\n\nConfirm or change it on the disputes desk.`,
      base ? [{ text: 'Open disputes', url: `${base}/admin/disputes` }] : undefined,
    );
  },
};

const STATEMENT_REMINDER_LEAD_MS = 12 * 3_600_000;

/// Reminds a side whose dispute statement is still missing, once, when the
/// window has 12 hours left. Recorded before emitting so a restart never
/// sends it twice.
async function maybeRemindStatements(deal: DirectDeal, now: number): Promise<void> {
  const sides = statementRemindersDue(deal, now, config.DISPUTE_STATEMENT_WINDOW_MS, STATEMENT_REMINDER_LEAD_MS);
  if (!sides.length) return;
  try {
    const remindedAt = { ...(deal.disputeStatementRemindedAt ?? {}) };
    for (const side of sides) remindedAt[side] = now;
    await patchDeal(deal.jobId, { disputeStatementRemindedAt: remindedAt });
    const closesAtMs = (deal.disputedAt ?? now) + config.DISPUTE_STATEMENT_WINDOW_MS;
    for (const side of sides) {
      bus.emitEvent({
        type: 'deal.dispute.statement.due',
        jobId: deal.jobId,
        actor: 'platform',
        payload: { buyer: deal.buyer, seller: deal.seller, side, closesAtMs },
      });
    }
  } catch (err) {
    logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'statement reminder failed (retried next tick)');
  }
}

/// The guard judge (v2): once both statements are in or the window closes, it
/// proposes a split for a reviewer to confirm. Never moves money itself.
async function maybeRunDisputeJudge(deal: DirectDeal, now: number): Promise<void> {
  if (config.DISPUTE_JUDGE_DISABLED || dealEscrowOps.isV3(deal) || processing.has(deal.jobId)) return;
  processing.add(deal.jobId);
  try {
    const outcome = await runDisputeJudge(deal, now, disputeJudgeDeps, { windowMs: config.DISPUTE_STATEMENT_WINDOW_MS });
    if (outcome !== 'none') logger.info({ jobId: deal.jobId }, 'dispute judge proposed a ruling');
  } catch (err) {
    logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'dispute judge failed (retried next tick)');
  } finally {
    processing.delete(deal.jobId);
  }
}

async function tick() {
  const now = Date.now();
  const deals = await listAllDeals();
  const pairHistory = buildPairHistory(deals);
  for (const deal of deals) {
    if (deal.cancelledAt || deal.settledAt) continue;
    // A disputed deal is otherwise invisible to every auto-release path below.
    // Left alone, a dispute whose counterparty goes silent never resolves (the
    // propose/accept exit needs their click; the arbiter is a manual admin
    // action). Hand it to the dispute-timeout resolver so money is never stuck,
    // then skip the release ladder, which does not apply to a disputed escrow.
    if (deal.disputed) {
      if (dealEscrowOps.isV3(deal)) {
        await runV3DisputeSafely(deal, now);
      } else if (!(await maybeApplyDeadlineRule(deal, now))) {
        await maybeRemindStatements(deal, now);
        await maybeRunDisputeJudge(deal, now);
        await maybeAutoResolveDispute(deal, now);
      }
      continue;
    }
    // Acceptance window expiry. Seller never agreed in time. Once the seller
    // agrees, the commercial acceptance window has done its job and the buyer
    // gets a separate opportunity to review the live fee before funding.
    // with kind 'pre-accept' so reputation isn't touched on either side; the
    // buyer is freed up to open a fresh deal elsewhere.
    if (sellerAgreementExpired(deal, now)) {
      await patchDeal(deal.jobId, {
        cancelledAt: now,
        cancelKind: 'pre-accept',
        cancelReason: 'acceptance window expired with no seller agreement',
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
        'acceptance window expired with no seller agreement, marking deal cancelled (pre-accept)',
      );
      continue;
    }
    // No escrow exists until the buyer funds after seller agreement, so there
    // is nothing for the on-chain watcher to inspect before acceptedAt.
    if (!deal.acceptedAt) continue;
    if (processing.has(deal.jobId)) continue;
    if (await maybeApplyDeadlineRule(deal, now)) continue;
    const parties = { buyer: deal.buyer, seller: deal.seller };
    // No buyer agent wallet means the agent physically cannot sign a release.
    // Surface it rather than skipping in silence; the parties still have the
    // manual release and the appeal path.
    if (!deal.buyerAgentWalletId) {
      await markBlocked(deal.jobId, 'no-agent-wallet', null, { reason: deal.releaseBlockedReason, detail: deal.releaseBlockedDetail }, parties);
      continue;
    }

    processing.add(deal.jobId);
    try {
      const account = await dealEscrowOps.read(deal);
      // v2.D: the watcher acts on accepted-but-not-yet-released escrows.
      // Pre-v2.D this was Funded; after the seller's acceptEscrow lands
      // (which the deal-accept route invokes), the state moves to Accepted
      // and stays there until milestones are released.
      if (account.state === ESCROW_DISPUTED) {
        await maybeResumePendingRefund(deal, account, now);
        continue;
      }
      if (account.state === ESCROW_FUNDED && !dealEscrowOps.isV3(deal)) {
        await maybeReclaimAfterDeadline(deal, account, now);
        continue;
      }
      if (account.state !== ESCROW_ACCEPTED) continue;
      const buyerWalletId = deal.buyerAgentWalletId;

      // v3: put a final delivery-check result on-chain for the delivery the
      // escrow shows, so the review clock and the arbiter can use it.
      if (account.version === 'v3') {
        const v3Deps = v3WatcherDeps();
        if (v3Deps) {
          await runV3Attestation(v3Deps, deal).catch((err) =>
            logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'v3 attestation failed (retried next tick)'),
          );
        }
      }

      // A seller who marks delivery on the contract directly starts the
      // buyer's review clock without us. Tell the buyer; never treat it as a
      // delivery we checked, so the release ladder below stays untouched.
      const outOfBand = onChainDeliveryAlert(deal, account);
      if (outOfBand) {
        await patchDeal(deal.jobId, { onChainDeliveryAlertedAt: outOfBand.deliveredAtMs });
        bus.emitEvent({
          type: 'deal.delivered.onchain',
          jobId: deal.jobId,
          actor: 'platform',
          payload: {
            buyer: deal.buyer,
            seller: deal.seller,
            deliveredAt: outOfBand.deliveredAtMs,
            claimableAt: outOfBand.claimableAtMs,
          },
        });
        logger.warn(
          { jobId: deal.jobId, deliveredAt: outOfBand.deliveredAtMs, claimableAt: outOfBand.claimableAtMs },
          'delivery marked on the escrow outside Karwan; buyer alerted',
        );
      }

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
      const evidenceReceipt = deal.delivered
        ? await readEvidenceReceipt(deal.jobId, deal.agreementVersion ?? 1, {
            evidenceRevision: deal.deliveryRevision,
            evidenceCommitment: deal.evidenceExpectedCommitment,
            reportId: deal.creEvidenceReceipt?.reportId,
            requireBinding: deal.evidenceRequired === true,
          })
        : undefined;
      const checkInput = {
        ...deal,
        evidenceRequired: deal.evidenceRequired,
        evidenceReceipt,
        manualReview: manualReviewActive(deal),
      };
      const blockReason: BlockReason | null = releaseBlockReasonForDelivery(checkInput);
      if (blockReason) {
        await markBlocked(
          deal.jobId,
          blockReason,
          deliveryCheckDetail(checkInput),
          { reason: deal.releaseBlockedReason, detail: deal.releaseBlockedDetail },
          parties,
        );
        continue;
      }
      if (deal.releaseBlockedReason) {
        await clearBlocked(deal.jobId, parties);
      }

      if (await maybeReclaimAfterDeadline(deal, account, now)) continue;

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
        const anchor = milestoneWindowAnchor(deal, nextIndex) ?? deal.deliveredAt;
        const windowMs = autoReleaseWindowMs(
          deal,
          nextIndex,
          pairHistory.get(pairKey(deal.buyer, deal.seller)) ?? 0,
        );
        if (now <= anchor + windowMs) continue;
        publishMilestonePayoutShadow(deal, account, nextIndex, Math.floor(now / 1_000));
        await dealEscrowOps.release(deal, nextIndex, buyerWalletId);
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
        publishMilestonePayoutShadow(deal, account, nextIndex, Math.floor(now / 1_000));
        await dealEscrowOps.release(deal, nextIndex, buyerWalletId);
        const settled = await dealEscrowOps.finalizeIfSettled(deal);
        await patchDeal(deal.jobId, {
          autoReleasedAt: now,
          lastReleaseAt: Date.now(),
          ...(settled ? { settledAt: Date.now() } : {}),
        });
        if (settled) {
          // Auto-release settled the deal: the seller has the funds, so pull the
          // financing repayment immediately instead of on the next watcher tick.
          void settleFactoringForDeal(deal.jobId);
          void settlePOFinancingForDeal(deal.jobId);
        }
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
