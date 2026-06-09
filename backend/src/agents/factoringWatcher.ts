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
import { listAllDeals } from '../db/deals.js';
import { listAcceptedOffers, patchFactoringOffer, type FactoringOffer } from '../db/factoring.js';
import { getUserByAddress } from '../db/users.js';
import {
  submitTransferWithAuthorization,
  transferFromCircleWallet,
} from '../chain/usdc3009.js';
import { bus } from '../events.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

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
      // Offer id as the idempotency key: a retry after an ambiguous
      // failure cannot double-charge the seller.
      offer.id,
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
    if (processing.has(offer.id)) continue;
    const deal = dealByJobId.get(offer.invoiceId.toLowerCase());
    if (!deal) continue;

    // Buyer refunded the escrow after the seller took the advance. The
    // seller was never paid by the escrow, so the repayment instrument
    // has nothing to draw on. Default and let the dispute path pursue
    // the seller's stake.
    if (deal.cancelledAt && !deal.settledAt) {
      processing.add(offer.id);
      try {
        await markDefaulted(offer, 'deal cancelled after factoring acceptance');
      } finally {
        processing.delete(offer.id);
      }
      continue;
    }

    if (!deal.settledAt) continue;

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
