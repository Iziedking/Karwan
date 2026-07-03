import { researchMarket } from '../x402/externalClient.js';
import { setResearchHeat } from '../agents/marketDemand.js';
import { bus } from '../events.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// The SecurityAgent fronts the single paid market-research call for an order
/// the moment it is posted, on the platform's Base x402 rail, and writes the
/// result into the shared keyword cache and demand heat. Every buyer and seller
/// agent on the deal then reads the SAME market intel from cache, so nobody bids
/// blind and nobody re-pays. It is neutral by design: the security agent is not
/// a counterparty, so the read is a shared good rather than an edge one side
/// bought.
///
/// Firing at post (not at first bid) warms the cache before any agent evaluates,
/// which keeps the paid call off the bid critical path (see the seller
/// bid-latency fix). Best-effort: the deal proceeds without a read on any
/// failure, and if this is skipped the buyer/seller research paths still pay as
/// a fallback. The matched pair is billed for the read later at match
/// (buyer.ts persistApprovedMatch), out of their research credit.
export async function securityResearchOrder(
  jobId: string,
  keywords: string[] | undefined,
): Promise<void> {
  if (!config.X402_PAID_SIGNALS_ENABLED || !config.X402_BASE_PRIVATE_KEY) return;
  const cleaned = (keywords ?? []).filter(Boolean);
  if (cleaned.length === 0) return;
  try {
    const read = await researchMarket(cleaned);
    setResearchHeat(cleaned, read);
    // Only record an agent.paid event when a payment actually settled. A free
    // read (endpoint answered the unpaid probe with 200, so payExternal returns
    // paidUsd 0 and no txHash) is NOT a payment and must not surface on the deal
    // page as a "$0.000" entry with no receipt. Mirrors the /research emitter.
    if (!read.cached && read.paidUsd > 0) {
      bus.emitEvent({
        type: 'agent.paid',
        jobId,
        actor: 'platform',
        payload: {
          rail: 'base',
          kind: 'research',
          agent: 'security',
          amountUsd: read.paidUsd,
          txHash: read.txHash,
          payer: read.payer,
          demand: read.demand,
          keywords: cleaned,
        },
      });
    }
    logger.info(
      { jobId, demand: read.demand, cached: read.cached },
      'security agent researched the order at post',
    );
  } catch (err) {
    logger.warn(
      { jobId, err: (err as Error).message },
      'security agent order research failed; deal proceeds without a market read',
    );
  }
}
