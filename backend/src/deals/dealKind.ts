import type { DealKind } from '../chain/agreementTerms.js';
import type { DirectDeal } from '../db/deals.js';

/// The kind of deal (view 32), worked out from what the two people agreed:
/// goods when something is shipped or handed over, stages when the price is
/// split, one payment otherwise. It is stored on the deal when it is made and
/// again when its terms change before anyone pays, so the escrow never guesses.

type KindInput = Pick<DirectDeal, 'firstReleasePct' | 'milestonePcts' | 'tradeType'>;

export function kindOf(deal: Partial<KindInput> & Pick<DirectDeal, 'firstReleasePct'>): DealKind {
  if (deal.tradeType === 'goods' || deal.tradeType === 'mixed') return 'goods';
  const split = deal.milestonePcts ?? (deal.firstReleasePct >= 100 ? [100] : [deal.firstReleasePct, 100 - deal.firstReleasePct]);
  return split.filter((p) => p > 0).length > 1 ? 'milestones' : 'one_time';
}

/// The stored kind; a deal from before it was stored is worked out the same way.
export function dealKindOf(deal: Partial<KindInput> & Pick<DirectDeal, 'firstReleasePct'> & { dealKind?: DealKind }): DealKind {
  return deal.dealKind ?? kindOf(deal);
}
