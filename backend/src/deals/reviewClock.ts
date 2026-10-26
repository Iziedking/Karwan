/// The most days a deal gives the buyer to check a delivery: the Agreement
/// escrow takes at most 30 days on chain. A buyer who needs longer asks once
/// for more time.
export const MAX_REVIEW_DAYS = 30;

/// Whether the buyer's review time is running. The escrow family starts it on
/// chain when the work is delivered (or on arrival or a check, which the chain
/// then enforces); the earlier escrows started it with the review window Karwan
/// recorded on the deal.
export function reviewHasStarted(deal: { escrowVersion?: 'v2' | 'v3' | 'suite'; delivered?: boolean; reviewWindowStartedAt?: number }): boolean {
  if (deal.escrowVersion === 'suite') return deal.delivered === true;
  return Boolean(deal.reviewWindowStartedAt);
}
