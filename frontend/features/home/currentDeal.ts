import { stageOf } from '@/features/deals/components/DirectDealList';
import type { DirectDeal } from '@/core/api';

/// The trade Home leads with: the open deal that moved most recently. Taking the
/// first row of the list let an old, stalled dispute sit there above the deal
/// someone is working on right now.
export function pickCurrentDeal(deals: readonly DirectDeal[]): DirectDeal | null {
  const open = deals.filter((deal) => {
    const stage = stageOf(deal);
    return stage !== 'settled' && stage !== 'cancelled';
  });
  const at = (deal: DirectDeal) => Number(deal.updatedAt ?? deal.createdAt ?? 0);
  return open.sort((a, b) => at(b) - at(a))[0] ?? null;
}
