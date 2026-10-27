import type { DirectDeal } from '@/core/api';

const FINISHED = new Set(['settled', 'cancelled']);

/// The deals from before the new escrow, as the legacy page lists them: open
/// ones first, then finished ones, newest first within each.
export function previousEscrowDeals(deals: DirectDeal[]): DirectDeal[] {
  const finished = (d: DirectDeal) => FINISHED.has(d.view?.stage ?? '');
  return deals
    .filter((d) => d.previousEscrow)
    .sort((a, b) => Number(finished(a)) - Number(finished(b)) || b.createdAt - a.createdAt);
}
