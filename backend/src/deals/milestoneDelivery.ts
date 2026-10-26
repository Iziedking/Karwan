import type { DirectDeal } from '../db/deals.js';

/// On the escrow family (and the v3 escrow) every milestone is delivered on its
/// own: paying one clears the delivery on chain, so the next payment waits for
/// the seller's next delivery. `deliveredMilestone` records which milestone the
/// current delivery is for; `milestonesReleased` is the chain's count of paid
/// ones. Deals on the earliest escrow keep its rule of one delivery, then the
/// payments.

type MilestoneDeal = Pick<DirectDeal, 'escrowVersion' | 'delivered' | 'deliveredMilestone' | 'settledAt' | 'cancelledAt'>;

function perMilestone(deal: MilestoneDeal): boolean {
  return deal.escrowVersion === 'suite' || deal.escrowVersion === 'v3';
}

/// The seller delivered an earlier milestone, it was paid, and the next one is
/// not delivered yet.
export function awaitingNextDelivery(deal: MilestoneDeal, milestonesReleased: number): boolean {
  if (!perMilestone(deal) || !deal.delivered || deal.settledAt || deal.cancelledAt) return false;
  return milestonesReleased > (deal.deliveredMilestone ?? 0);
}

/// The milestone that is next to be paid has been delivered.
export function currentMilestoneDelivered(deal: MilestoneDeal, milestonesReleased: number): boolean {
  return !!deal.delivered && !awaitingNextDelivery(deal, milestonesReleased);
}
