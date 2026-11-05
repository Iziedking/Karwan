import { getRequestRows } from '../agents/buyer.js';
import { getDeal } from '../db/deals.js';
import { getMatchProposal, type MatchProposal } from '../db/matchProposals.js';
import { getPendingNearMiss } from '../db/nearMiss.js';
import { listed, requestState, type RequestState } from './requestState.js';

/// The requests the open market shows (view 53): open ones, ones in
/// negotiation, and agreed ones for 7 days, each with its state.

type Row = ReturnType<typeof getRequestRows>[number];
export type PublicRequestRow = Row & { state: Exclude<RequestState, 'ended'>; chosenSeller: string | null };

export type PublicRequestDeps = {
  rows: () => Row[];
  proposal: (jobId: string) => Promise<MatchProposal | null>;
  hasDeal: (jobId: string) => Promise<boolean>;
  nearMiss: (jobId: string) => boolean;
  nowMs: () => number;
};

export const livePublicRequestDeps: PublicRequestDeps = {
  rows: getRequestRows,
  proposal: (jobId) => getMatchProposal(jobId).catch(() => null),
  hasDeal: async (jobId) => !!(await getDeal(jobId).catch(() => null)),
  nearMiss: (jobId) => !!getPendingNearMiss(jobId),
  nowMs: () => Date.now(),
};

async function place(row: Row, deps: PublicRequestDeps): Promise<PublicRequestRow | null> {
  const proposal = await deps.proposal(row.jobId);
  const s = requestState({
    finalized: row.finalized,
    escrowFunded: row.escrowFunded,
    proposal,
    deal: await deps.hasDeal(row.jobId),
    nearMiss: deps.nearMiss(row.jobId),
  });
  if (s.state === 'ended' || !listed(s, deps.nowMs())) return null;
  const chosenSeller = proposal && !proposal.declinedAt ? proposal.sellerUser.toLowerCase() : null;
  return { ...row, state: s.state, chosenSeller };
}

const ORDER: Record<PublicRequestRow['state'], number> = { open: 0, negotiating: 1, agreed: 2 };

/// Open first, then in negotiation, then agreed; newest first within each.
export async function publicRequests(deps: PublicRequestDeps = livePublicRequestDeps): Promise<PublicRequestRow[]> {
  // A private request (view 53) is never on the market.
  const placed = await Promise.all(deps.rows().filter((row) => row.visibility !== 'agents').map((row) => place(row, deps)));
  return placed
    .filter((r): r is PublicRequestRow => r !== null)
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.postedAt - a.postedAt);
}

export async function publicRequestOf(jobId: string, deps: PublicRequestDeps = livePublicRequestDeps): Promise<PublicRequestRow | null> {
  const row = deps.rows().find((r) => r.jobId.toLowerCase() === jobId.toLowerCase());
  return row ? place(row, deps) : null;
}
