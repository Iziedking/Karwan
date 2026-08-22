/// Factoring settlement watcher. Scans accepted factoring offers each
/// tick; when the underlying escrow settles (the seller has been paid),
/// it moves the repayment on chain: expectedReturnUsdc from the seller to
/// the financier. The offer flips to 'settled' only after the transfer
/// confirms with a real tx hash.
///
/// Since receivable assignment shipped, the usual case is that there is
/// nothing to do: the escrow pays an assigned financier out of the settlement
/// ahead of the seller, so this watcher sees the debt already cleared and just
/// flips the offer to settled. Pulling anyway would charge the seller twice.
///
/// The pull below remains for the shortfall case (the deal settled for less
/// than the repay amount) and for offers accepted before assignment existed:
///   - Web3 seller: the EIP-3009 authorization they signed at accept.
///   - Circle seller: a direct transfer from their identity wallet.
///
/// Failure handling: a failed transfer keeps the offer 'accepted' and
/// retries on the next tick. After MAX_SETTLE_ATTEMPTS the offer flips to
/// 'defaulted' (most common cause: the seller drained their wallet before
/// the watcher fired, or a web3 authorization expired). The off-chain
/// dispute path records the default for operational follow-up. The current
/// invoice-registry contract does not reserve or automatically recover stake.

import { formatUnits, parseUnits } from 'viem';
import { listAllDeals, getDeal, type DirectDeal } from '../db/deals.js';
import { appendActivity } from '../db/activityLog.js';
import { listAcceptedOffers, patchFactoringOffer, type FactoringOffer } from '../db/factoring.js';
import { getUserByAddress } from '../db/users.js';
import {
  submitTransferWithAuthorization,
  transferFromCircleWallet,
} from '../chain/usdc3009.js';
import { deterministicIdempotencyKey } from '../chain/txs.js';
import { bus } from '../events.js';
import { addSystemMessage } from '../chat/systemMessages.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';
import {
  financingOperationKey,
  readEscrowAssignmentPaid,
  recordEscrowAssignedFinancingMovement,
  recordVerifiedFinancingMovement,
} from '../money/financing.js';

const TICK_MS = Number(process.env.FACTORING_WATCHER_TICK_MS ?? 60_000);
const MAX_SETTLE_ATTEMPTS = 5;
const USDC_DECIMALS = 6;

const processing = new Set<string>();

async function settleOffer(offer: FactoringOffer): Promise<void> {
  const repayAtomic = parseUnits(offer.expectedReturnUsdc, USDC_DECIMALS).toString();

  // The escrow pays an assigned financier out of the settlement itself, ahead
  // of the seller. Pulling the full amount again here would charge the seller
  // twice for the same advance, so ask the escrow what it already paid and
  // only collect a shortfall (which arises when the deal settled for less than
  // the repay amount). Read with a local ABI so this does not depend on the
  // generated escrow ABI being regenerated first.
  let alreadyPaid = 0n;
  try {
    alreadyPaid = await readEscrowAssignmentPaid(offer.invoiceId);
  } catch {
    // Pre-assignment escrow generation, or an unreachable node. Fall through to
    // the pull, which is what those offers were accepted under.
  }

  if (alreadyPaid >= BigInt(repayAtomic)) {
    const assigned = await recordEscrowAssignedFinancingMovement({
      operationKey: financingOperationKey('factoring', offer.id, 'repayment', `escrow:${offer.invoiceId}`),
      positionId: offer.invoiceId,
      amountMicros: BigInt(repayAtomic),
      initiatedBy: offer.seller,
      financierAddress: offer.financier,
      jobId: offer.invoiceId,
      summary: `Financing repayment of ${formatUnits(BigInt(repayAtomic), USDC_DECIMALS)} USDC for invoice ${offer.invoiceId}`,
    });
    logger.info(
      { offerId: offer.id, alreadyPaid: alreadyPaid.toString(), txHash: assigned.txHash, reference: assigned.movement.reference },
      'factoring: escrow already paid the financier; linked the exact payout receipt',
    );
    await patchFactoringOffer(offer.id, { status: 'settled', settledAt: Date.now(), settleTxHash: assigned.txHash });
    await addSystemMessage({ jobId: offer.invoiceId, channel: 'financing', channelKey: offer.id, financingKind: 'factoring', financingId: offer.id, eventType: 'factoring.settled', occurrenceKey: assigned.txHash, body: 'The factoring position was repaid from escrow and is now closed.' });
    bus.emitEvent({
      type: 'factoring.settled',
      jobId: offer.invoiceId,
      actor: 'platform',
      payload: {
        offerId: offer.id,
        financier: offer.financier,
        seller: offer.seller,
        repayUsdc: formatUnits(BigInt(repayAtomic), USDC_DECIMALS),
        settleTxHash: assigned.txHash,
        reference: assigned.movement.reference,
      },
    });
    void appendActivity({
      address: offer.financier,
      kind: 'financing_repaid',
      summary: `Repaid ${formatUnits(BigInt(repayAtomic), USDC_DECIMALS)} USDC on invoice ${offer.invoiceId}`,
      params: { t: 'financingRepaid', amount: formatUnits(BigInt(repayAtomic), USDC_DECIMALS), job: String(offer.invoiceId) },
      amountUsdc: formatUnits(BigInt(repayAtomic), USDC_DECIMALS),
      txHash: assigned.txHash,
      jobId: offer.invoiceId,
      counterparty: offer.seller?.toLowerCase(),
      refId: assigned.movement.reference,
    });
    return;
  }

  let assignedReference: string | undefined;
  let assignedTxHash: string | undefined;
  if (alreadyPaid > 0n) {
    const assigned = await recordEscrowAssignedFinancingMovement({
      operationKey: financingOperationKey('factoring', offer.id, 'repayment-escrow', `escrow:${offer.invoiceId}:${alreadyPaid}`),
      positionId: offer.invoiceId,
      amountMicros: alreadyPaid,
      initiatedBy: offer.seller,
      financierAddress: offer.financier,
      jobId: offer.invoiceId,
      summary: `Financing repayment of ${formatUnits(alreadyPaid, USDC_DECIMALS)} USDC from escrow for invoice ${offer.invoiceId}`,
    });
    assignedReference = assigned.movement.reference;
    assignedTxHash = assigned.txHash;
    void appendActivity({
      address: offer.financier,
      kind: 'financing_repaid',
      summary: `Repaid ${formatUnits(alreadyPaid, USDC_DECIMALS)} USDC from escrow on invoice ${offer.invoiceId}`,
      params: { t: 'financingRepaid', amount: formatUnits(alreadyPaid, USDC_DECIMALS), job: String(offer.invoiceId) },
      amountUsdc: formatUnits(alreadyPaid, USDC_DECIMALS),
      txHash: assignedTxHash,
      jobId: offer.invoiceId,
      counterparty: offer.seller?.toLowerCase(),
      refId: assignedReference,
    });
  }

  const shortfallAtomic = BigInt(repayAtomic) - alreadyPaid;
  if (offer.repayAuthorization && alreadyPaid > 0n) {
    throw new Error(
      'partial escrow repayment needs a new authorization for the remaining balance',
    );
  }
  let txHash: string;
  if (offer.repayAuthorization && alreadyPaid === 0n) {
    const r = await submitTransferWithAuthorization(
      offer.repayAuthorization,
      `factoring.repay(${offer.id})`,
    );
    txHash = r.txHash;
  } else {
    const sellerUser = getUserByAddress(offer.seller);
    if (!sellerUser) {
      throw new Error(
        'no settlement instrument: seller is not a Circle user and no repayment authorization was captured at accept',
      );
    }
    const r = await transferFromCircleWallet(
      sellerUser.circleIdentityWalletId,
      offer.financier,
      shortfallAtomic.toString(),
      `factoring.repay(${offer.id})`,
      // Namespaced idempotency key: a retry after an ambiguous failure cannot
      // double-charge the seller. Namespacing matters: the ADVANCE leg used
      // raw offer.id too, and a shared key would make Circle dedupe this
      // repayment against the advance and silently skip paying the financier.
      deterministicIdempotencyKey(`factoring-repay:${offer.id}`),
    );
    txHash = r.txHash;
  }

  let repaymentReference: string | undefined;
  try {
    const movement = await recordVerifiedFinancingMovement({
      operationKey: financingOperationKey('factoring', offer.id, 'repayment', txHash),
      kind: 'financing_repayment',
      positionId: offer.invoiceId,
      amountUsdc: (Number(shortfallAtomic) / 1_000_000).toFixed(6),
      initiatedBy: offer.seller,
      sourceAddress: offer.seller,
      destinationAddress: offer.financier,
      txHash,
      summary: `Financing repayment of ${(Number(shortfallAtomic) / 1_000_000).toFixed(6)} USDC for invoice ${offer.invoiceId}`,
    });
    repaymentReference = movement.reference;
  } catch (err) {
    logger.warn({ offerId: offer.id, txHash, err: (err as Error).message }, 'factoring: repayment confirmed but receipt reconciliation failed');
    throw err;
  }

  await patchFactoringOffer(offer.id, {
    status: 'settled',
    settledAt: Date.now(),
    settleTxHash: txHash,
  });
  await addSystemMessage({ jobId: offer.invoiceId, channel: 'financing', channelKey: offer.id, financingKind: 'factoring', financingId: offer.id, eventType: 'factoring.settled', occurrenceKey: txHash, body: 'The factoring position was repaid and is now closed.' });

  bus.emitEvent({
    type: 'factoring.settled',
    jobId: offer.invoiceId,
    actor: 'platform',
    payload: {
      offerId: offer.id,
      financier: offer.financier,
      seller: offer.seller,
      repayUsdc: (Number(shortfallAtomic) / 1_000_000).toFixed(6),
      settleTxHash: txHash,
    },
  });

  // The financier's money coming back. Without this the only trace a financier
  // had of being repaid was the deal page; their own history ended at the
  // advance going out.
  void appendActivity({
    address: offer.financier,
    kind: 'financing_repaid',
    summary: `Repaid ${(Number(shortfallAtomic) / 1_000_000).toFixed(6)} USDC on invoice ${offer.invoiceId}`,
    params: {
      t: 'financingRepaid',
      amount: (Number(shortfallAtomic) / 1_000_000).toFixed(6),
      job: String(offer.invoiceId),
    },
    amountUsdc: (Number(shortfallAtomic) / 1_000_000).toFixed(6),
    txHash,
    jobId: offer.invoiceId,
    counterparty: offer.seller?.toLowerCase(),
    refId: repaymentReference,
  });

  logger.info(
    {
      offerId: offer.id,
      invoiceId: offer.invoiceId,
      financier: offer.financier,
      repayUsdc: offer.expectedReturnUsdc,
      settleTxHash: txHash,
    },
    'factoring: repayment settled on chain',
  );
}

async function markDefaulted(offer: FactoringOffer, reason: string): Promise<void> {
  await patchFactoringOffer(offer.id, {
    status: 'defaulted',
    lastSettleError: reason,
  });
  await addSystemMessage({ jobId: offer.invoiceId, channel: 'financing', channelKey: offer.id, financingKind: 'factoring', financingId: offer.id, eventType: 'factoring.defaulted', occurrenceKey: String(Date.now()), body: 'The factoring position defaulted and is now closed.' });
  bus.emitEvent({
    type: 'factoring.defaulted',
    jobId: offer.invoiceId,
    actor: 'platform',
    payload: {
      offerId: offer.id,
      financier: offer.financier,
      seller: offer.seller,
      reason,
    },
  });
  logger.warn(
    { offerId: offer.id, invoiceId: offer.invoiceId, reason },
    'factoring: offer defaulted',
  );
}

/// Settle or default a single accepted offer against its deal. Shared by the
/// periodic tick and the on-settlement fast path. Idempotent under the
/// `processing` guard, so a tick and a settlement hook cannot double-submit the
/// same repayment.
async function processOffer(offer: FactoringOffer, deal: DirectDeal): Promise<void> {
  if (processing.has(offer.id)) return;

  // Buyer refunded the escrow after the seller took the advance. The seller was
  // never paid by the escrow, so the repayment instrument has nothing to draw
  // on. Record the default for operational follow-up.
  if (deal.cancelledAt && !deal.settledAt) {
    processing.add(offer.id);
    try {
      await markDefaulted(offer, 'deal cancelled after factoring acceptance');
    } finally {
      processing.delete(offer.id);
    }
    return;
  }

  if (!deal.settledAt) return;

  processing.add(offer.id);
  try {
    await settleOffer(offer);
  } catch (err) {
    const attempts = (offer.settleAttempts ?? 0) + 1;
    const reason = (err as Error).message;
    logger.warn(
      { offerId: offer.id, attempts, err: reason },
      'factoring watcher: repayment transfer failed; will retry',
    );
    if (attempts >= MAX_SETTLE_ATTEMPTS) {
      await markDefaulted(
        offer,
        `repayment failed after ${attempts} attempts: ${reason}`,
      ).catch(() => {});
    } else {
      await patchFactoringOffer(offer.id, {
        settleAttempts: attempts,
        lastSettleError: reason,
      }).catch(() => {});
    }
  } finally {
    processing.delete(offer.id);
  }
}

/// Pull the factoring repayment the moment a deal settles, rather than waiting
/// for the next poll tick. Called from the settlement paths in deals.ts, so the
/// window between the seller receiving escrow funds and the repayment being
/// pulled is as small as the runtime allows. Best-effort: any failure is caught
/// here and the periodic tick remains the retry safety net.
export async function settleFactoringForDeal(jobId: string): Promise<void> {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) return;
  try {
    const deal = await getDeal(jobId);
    if (!deal) return;
    const offers = await listAcceptedOffers();
    const invoice = jobId.toLowerCase();
    for (const offer of offers) {
      if (offer.invoiceId.toLowerCase() === invoice) await processOffer(offer, deal);
    }
  } catch (err) {
    logger.warn(
      { jobId, err: (err as Error).message },
      'factoring: immediate settle-on-deal failed; the periodic watcher will retry',
    );
  }
}

async function tick(): Promise<void> {
  let offers;
  try {
    offers = await listAcceptedOffers();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'factoring watcher: listAcceptedOffers failed; skipping tick',
    );
    return;
  }
  if (offers.length === 0) return;

  let deals;
  try {
    deals = await listAllDeals();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'factoring watcher: listAllDeals failed; skipping tick',
    );
    return;
  }
  const dealByJobId = new Map(deals.map((d) => [d.jobId.toLowerCase(), d]));

  for (const offer of offers) {
    const deal = dealByJobId.get(offer.invoiceId.toLowerCase());
    if (!deal) continue;
    await processOffer(offer, deal);
  }
}

/// Starts the periodic factoring settlement watcher. Returns a stop
/// function. No-ops cleanly when the SME rail isn't configured.
export function startFactoringWatcher(): () => void {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) {
    logger.info(
      'factoring watcher: KARWAN_INVOICE_REGISTRY_ADDR unset; watcher dormant',
    );
    return () => {};
  }
  const id = setInterval(() => {
    recordHeartbeat('factoringWatcher');
    tick().catch((err) =>
      logger.error(
        { err: (err as Error).message },
        'factoring watcher: tick failed',
      ),
    );
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'factoring watcher started');
  return () => clearInterval(id);
}
