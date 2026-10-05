import type { MatchProposal } from '../db/matchProposals.js';

type Gate = Pick<MatchProposal, 'approvedAt' | 'declinedAt' | 'awaitingParty' | 'raisedPriceUsdc' | 'originalPriceUsdc' | 'raisedAt' | 'raiseOverCap'>;

/// The human-gate fields a re-propose keeps from the stored proposal. Only a
/// refresh of the same match (say the fundability check after a top-up) keeps
/// them. A match to another seller, or an offer a person chose, starts clean;
/// carrying a decline across is how a freshly chosen offer was born declined.
export function carriedGate(
  prior: (Gate & { sellerAgent: string }) | null | undefined,
  sellerAgent: string,
  opts: { humanChosen: boolean },
): Gate {
  if (!prior || opts.humanChosen || prior.sellerAgent.toLowerCase() !== sellerAgent.toLowerCase()) return {};
  const kept: Gate = {};
  if (prior.awaitingParty === 'buyer' && prior.raisedPriceUsdc) {
    kept.awaitingParty = prior.awaitingParty;
    kept.raisedPriceUsdc = prior.raisedPriceUsdc;
    kept.originalPriceUsdc = prior.originalPriceUsdc;
    kept.raisedAt = prior.raisedAt;
    kept.raiseOverCap = prior.raiseOverCap;
  }
  if (prior.approvedAt) kept.approvedAt = prior.approvedAt;
  if (prior.declinedAt) kept.declinedAt = prior.declinedAt;
  return kept;
}
