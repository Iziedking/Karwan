import type { DirectDeal } from '../db/deals.js';

/// Once the escrow family is live on this network, a deal that opened before it
/// sits on the escrow from before and finishes there. The legacy page lists
/// these so people can reconcile them (view 27, "Moving over"). Before the family
/// is live, as on mainnet today, nothing is marked.
export function onPreviousEscrow(deal: Pick<DirectDeal, 'escrowVersion'>, familyLive: boolean): boolean {
  return familyLive && (deal.escrowVersion ?? 'v2') !== 'suite';
}

export function withPreviousEscrow<T extends Pick<DirectDeal, 'escrowVersion'>>(deals: T[], familyLive: boolean): Array<T & { previousEscrow?: true }> {
  return deals.map((deal) => (onPreviousEscrow(deal, familyLive) ? { ...deal, previousEscrow: true as const } : deal));
}
