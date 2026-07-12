/// Factoring settlement watcher. Scans accepted factoring offers each
/// tick; when the underlying escrow settles (the seller has been paid),
/// it moves the repayment on chain: expectedReturnUsdc from the seller to
/// the financier. The offer flips to 'settled' only after the transfer
/// confirms with a real tx hash.
///
/// Settlement instrument per seller type:
///   - Web3 seller: the EIP-3009 authorization they signed at offer
///     accept (stored on the offer), submitted on the USDC contract by
///     the platform relay. The seller signed with a zero balance; the
///     escrow payout funds the transfer by the time this fires.
///   - Circle seller: a direct transfer from their identity wallet,
///     signed by the backend. No pre-authorization needed.
///
/// Failure handling: a failed transfer keeps the offer 'accepted' and
/// retries on the next tick. After MAX_SETTLE_ATTEMPTS the offer flips to
/// 'defaulted' (most common cause: the seller drained their wallet before
/// the watcher fired, or a web3 authorization expired). The off-chain
/// dispute path pursues remediation against the seller's stake.

import { parseUnits } from 'viem';
import { listAllDeals, getDeal, type DirectDeal } from '../db/deals.js';
import { listAcceptedOffers, patchFactoringOffer, type FactoringOffer } from '../db/factoring.js';
import { getUserByAddress } from '../db/users.js';
import {
  submitTransferWithAuthorization,
  transferFromCircleWallet,
} from '../chain/usdc3009.js';
import { deterministicIdempotencyKey } from '../chain/txs.js';
import { bus } from '../events.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';

const TICK_MS = Number(process.env.FACTORING_WATCHER_TICK_MS ?? 60_000);
const MAX_SETTLE_ATTEMPTS = 5;
const USDC_DECIMALS = 6;

const processing = new Set<string>();

async function settleOffer(offer: FactoringOffer): Promise<void> {
  const repayAtomic = parseUnits(offer.expectedReturnUsdc, USDC_DECIMALS).toString();

  let txHash: string;
  if (offer.repayAuthorization) {
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
      repayAtomic,
      `factoring.repay(${offer.id})`,
      // Namespaced idempotency key: a retry after an ambiguous failure cannot
      // double-charge the seller. Namespacing matters: the ADVANCE leg used
      // raw offer.id too, and a shared key would make Circle dedupe this
      // repayment against the advance and silently skip paying the financier.
      deterministicIdempotencyKey(`factoring-repay:${offer.id}`),
    );
    txHash = r.txHash;
  }

  await patchFactoringOffer(offer.id, {
    status: 'settled',
    settledAt: Date.now(),
    settleTxHash: txHash,
  });

  bus.emitEvent({
    type: 'factoring.settled',
    jobId: offer.invoiceId,
    actor: 'platform',
    payload: {
      offerId: offer.id,
      financier: offer.financier,
      seller: offer.seller,
      repayUsdc: offer.expectedReturnUsdc,
      settleTxHash: txHash,
    },
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
  // on. Default and let the dispute path pursue the seller's stake.
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
