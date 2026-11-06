import { config } from '../config.js';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { isRequestOwner } from '../agents/chooseOffer.js';
import { listAllBriefs, getBrief } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { listListingsForSeller } from '../db/listings.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';
import { statementWindowOpen } from '../deals/disputeJudge.js';
import { nextMoves, type NextMove } from './nextMove.js';

/// The person's next moves from the live stores. One reader for the web nudge
/// (GET /api/guide/next) and the assistant's whats_pending.
export async function readNextMoves(address: string, now = Date.now()): Promise<NextMove[]> {
  const [deals, proposals] = await Promise.all([listDealsForAddress(address), listMatchProposalsForUser(address)]);
  const requestsWithOffers: { jobId: string; offers: number }[] = [];
  for (const job of getBuyerSnapshot().jobs) {
    if (!job.bids.length || job.finalized || job.cancelledAt || job.expiredAt) continue;
    const brief = getBrief(job.jobId);
    if (!brief || !isRequestOwner(address, brief)) continue;
    requestsWithOffers.push({ jobId: job.jobId, offers: job.bids.length });
  }
  const postedAnything =
    listListingsForSeller(address).length > 0 || listAllBriefs().some((b) => isRequestOwner(address, b));
  return nextMoves({
    address,
    deals,
    proposals,
    requestsWithOffers,
    postedAnything,
    statementOpen: (d) => statementWindowOpen(d, now, config.DISPUTE_STATEMENT_WINDOW_MS),
    now,
  });
}
