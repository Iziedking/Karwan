/// Factoring settlement watcher. Periodically scans accepted factoring
/// offers; when the underlying escrow settles, marks the offer as settled
/// and emits a `factoring.settled` event along with the Gateway batch
/// payload the production path would submit to Circle's
/// `BatchFacilitatorClient`.
///
/// v1 (testnet demo) deliberately does NOT submit the Gateway batch yet:
/// the seller's wallet authorization capture flow (off-chain EIP-3009
/// signing at offer-accept time) is the missing piece, and submitting
/// without it would race the seller's own ability to move funds. The
/// state transition, event emission, and payload shape are correct, so a
/// production swap is contained to a single `submitGatewayBatch()` call.
///
/// Source of truth for "settled" is the off-chain DirectDeal.settledAt;
/// the off-chain deal flips when the chain settlement watcher confirms
/// release. No extra RPC needed in this loop.

import { listAllDeals } from '../db/deals.js';
import { listOpenOffers, patchFactoringOffer } from '../db/factoring.js';
import { bus } from '../events.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const TICK_MS = Number(process.env.FACTORING_WATCHER_TICK_MS ?? 60_000);
const processing = new Set<string>();

/// Each batch leg carries: payer (seller), recipient, amountUsdc. The
/// production `submitGatewayBatch` wraps these into the
/// `BatchFacilitatorClient.settle` payload (cascading EIP-3009
/// authorisations on Arc Testnet via the Gateway Wallet at
/// 0x0077777d7EBA4688BDeF3E311b846F25870A19B9).
interface BatchLeg {
  from: string;
  to: string;
  amountUsdc: string;
  purpose: 'factoring-repay' | 'platform-fee' | 'seller-residual';
}

interface GatewayBatchPayload {
  invoiceId: string;
  offerId: string;
  chainId: number;
  gatewayWalletAddress: string;
  legs: BatchLeg[];
}

/// Arc Testnet Gateway Wallet (from `docs/sme-design.md` §12). Lives at
/// the same address across every chain Gateway supports.
const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const ARC_TESTNET_CHAIN_ID = 5042002;

async function tick(): Promise<void> {
  let offers;
  try {
    offers = await listOpenOffers();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'factoring watcher: listOpenOffers failed; skipping tick',
    );
    return;
  }
  if (offers.length === 0) return;

  // Build a deals index keyed by invoiceId once per tick so we don't
  // re-scan listAllDeals inside the loop.
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
    if (offer.status !== 'accepted') continue;
    if (processing.has(offer.id)) continue;
    const deal = dealByJobId.get(offer.invoiceId.toLowerCase());
    if (!deal) continue;
    if (!deal.settledAt) continue;
    /// Buyer refunded the escrow (cancel after factoring acceptance).
    /// Mark the offer defaulted and let the off-chain dispute pursue
    /// remediation against the seller's stake.
    if (deal.cancelledAt && !deal.settledAt) {
      processing.add(offer.id);
      try {
        await patchFactoringOffer(offer.id, { status: 'defaulted' });
        bus.emitEvent({
          type: 'factoring.defaulted',
          jobId: offer.invoiceId,
          actor: 'platform',
          payload: { offerId: offer.id, financier: offer.financier, seller: offer.seller },
        });
        logger.warn(
          { offerId: offer.id, invoiceId: offer.invoiceId },
          'factoring: deal cancelled post-acceptance, offer defaulted',
        );
      } finally {
        processing.delete(offer.id);
      }
      continue;
    }

    processing.add(offer.id);
    try {
      const payload = buildGatewayBatchPayload(offer);
      logger.info(
        { ...payload },
        'factoring: gateway batch payload prepared',
      );

      // Production path: submitGatewayBatch(payload). v1 testnet skips
      // the actual submission until the seller-side EIP-3009 capture
      // flow lands. The state transitions below mirror what the live
      // batch settlement would produce.
      await patchFactoringOffer(offer.id, {
        status: 'settled',
        settledAt: Date.now(),
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
          gatewayPayload: payload,
        },
      });

      logger.info(
        {
          offerId: offer.id,
          invoiceId: offer.invoiceId,
          financier: offer.financier,
          repayUsdc: offer.expectedReturnUsdc,
        },
        'factoring: offer settled',
      );
    } catch (err) {
      logger.warn(
        { offerId: offer.id, err: (err as Error).message },
        'factoring watcher: settle step failed',
      );
    } finally {
      processing.delete(offer.id);
    }
  }
}

/// Compose the Circle Gateway batch payload a production submission
/// would carry. Legs are ordered so the financier is paid first, then
/// the platform fee, then any seller residual. Treasury cut comes from
/// the escrow's existing fee deduction at release time, so the
/// platform-fee leg here is intentionally empty — factoring does not
/// add a second fee on top.
function buildGatewayBatchPayload(offer: {
  id: string;
  invoiceId: string;
  seller: string;
  financier: string;
  expectedReturnUsdc: string;
}): GatewayBatchPayload {
  const legs: BatchLeg[] = [
    {
      from: offer.seller,
      to: offer.financier,
      amountUsdc: offer.expectedReturnUsdc,
      purpose: 'factoring-repay',
    },
  ];
  return {
    invoiceId: offer.invoiceId,
    offerId: offer.id,
    chainId: ARC_TESTNET_CHAIN_ID,
    gatewayWalletAddress: GATEWAY_WALLET_ADDRESS,
    legs,
  };
}

/// Starts the periodic factoring settlement watcher. Returns a stop
/// function. No-ops cleanly when the feature is disabled via config.
export function startFactoringWatcher(): () => void {
  // Gate behind the registry env so the watcher stays dormant when SME
  // contracts haven't been wired yet. The registry being unset is a
  // strong signal that this deployment isn't running the SME rail.
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
