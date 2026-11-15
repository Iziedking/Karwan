import { config } from '../config.js';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { isRequestOwner } from '../agents/chooseOffer.js';
import { getBrief } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';
import { statementWindowOpen } from '../deals/disputeJudge.js';
import { nextMoves, type NextMove } from './nextMove.js';
import { readSetupFacts } from './readSetupFacts.js';
import { setupSteps } from './setupSteps.js';

/// The person's next moves from the live stores. One reader for the web nudge
/// (GET /api/guide/next) and the assistant's whats_pending. `method` is how the
/// account signs in, which decides what its balance counts.
export async function readNextMoves(address: string, method: string | undefined, now = Date.now()): Promise<NextMove[]> {
  const [deals, proposals, facts] = await Promise.all([
    listDealsForAddress(address),
    listMatchProposalsForUser(address),
    readSetupFacts(address, method).catch(() => null),
  ]);
  const requestsWithOffers: { jobId: string; offers: number }[] = [];
  for (const job of getBuyerSnapshot().jobs) {
    if (!job.bids.length || job.finalized || job.cancelledAt || job.expiredAt) continue;
    const brief = getBrief(job.jobId);
    if (!brief || !isRequestOwner(address, brief)) continue;
    requestsWithOffers.push({ jobId: job.jobId, offers: job.bids.length });
  }
  return nextMoves({
    address,
    deals,
    proposals,
    requestsWithOffers,
    setup: facts ? setupSteps(facts, config.ARC_NETWORK) : null,
    statementOpen: (d) => statementWindowOpen(d, now, config.DISPUTE_STATEMENT_WINDOW_MS),
    now,
  });
}
