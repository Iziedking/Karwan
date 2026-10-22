import type { DirectDeal } from '../db/deals.js';

/// After a payout, checks the escrow and, once it has settled, writes the
/// settlement onto the deal record and settles any financing on it. Every
/// path that pays the seller goes through here, so a deal the seller claimed
/// counts as settled exactly like one the buyer released.

export interface SettlementDeps {
  /// True once the escrow on chain reads settled.
  finalize: (deal: DirectDeal) => Promise<boolean>;
  patch: (jobId: string, patch: Partial<DirectDeal>) => Promise<unknown>;
  settleFinancing: (jobId: string) => void;
}

export async function recordSettlement(deal: DirectDeal, paidAt: number, deps: SettlementDeps): Promise<boolean> {
  const settled = await deps.finalize(deal);
  if (!settled) {
    await deps.patch(deal.jobId, { lastReleaseAt: paidAt });
    return false;
  }
  await deps.patch(deal.jobId, { settledAt: deal.settledAt ?? paidAt, lastReleaseAt: paidAt });
  deps.settleFinancing(deal.jobId);
  return true;
}
