import { formatUnits, parseUnits } from 'viem';
import type { DirectDeal, FactoringOffer } from '@/core/api';

const DECIMALS = 6;
/// Below this many open invoices a filter hides more than it finds.
const FILTER_FROM = 7;

/// What the financier has out right now. Amounts are summed in base units so a
/// handful of decimals never drifts.
export function positionsSummary(offers: readonly FactoringOffer[]): {
  active: number;
  outUsdc: string;
  expectedUsdc: string;
  needsReview: number;
} {
  const live = offers.filter((o) => o.status === 'accepted');
  const sum = (pick: (o: FactoringOffer) => string) =>
    formatUnits(live.reduce((total, o) => total + parseUnits(pick(o), DECIMALS), 0n), DECIMALS);
  return {
    active: live.length,
    outUsdc: sum((o) => o.offeredAdvanceUsdc),
    expectedUsdc: sum((o) => o.expectedReturnUsdc),
    needsReview: offers.filter((o) => o.status === 'defaulted').length,
  };
}

export function showFilters(openCount: number, filterActive: boolean): boolean {
  return filterActive || openCount >= FILTER_FROM;
}

export type TermKey = 'immediate' | 'net30' | 'net60' | 'net90';

export function termKey(terms: DirectDeal['paymentTerms'] | null): TermKey {
  return terms === 'net30' || terms === 'net60' || terms === 'net90' ? terms : 'immediate';
}

/// The financier's positions in the order they need reading: anything waiting
/// on them, then money still out, then the finished record. A paginated list
/// sorted by date alone put a position needing review on page two.
export function groupPositions(offers: readonly FactoringOffer[]): {
  needsYou: FactoringOffer[];
  active: FactoringOffer[];
  history: FactoringOffer[];
} {
  const at = (o: FactoringOffer) => o.settledAt ?? o.acceptedAt ?? o.updatedAt ?? o.offeredAt;
  const newest = (a: FactoringOffer, b: FactoringOffer) => at(b) - at(a);
  const pick = (statuses: readonly FactoringOffer['status'][]) => offers.filter((o) => statuses.includes(o.status));
  return {
    // Paying the seller has a 24-hour clock, so it leads.
    needsYou: [...pick(['awaiting_financier']).sort(newest), ...pick(['defaulted']).sort(newest)],
    active: pick(['accepted']).sort(newest),
    history: pick(['settled', 'repaid', 'waived']).sort(newest),
  };
}

/// Before delivery the advance works like purchase-order finance, after it
/// like invoice finance. Both are the same Get paid now on the deal.
export function invoiceTiming(deal: Pick<DirectDeal, 'delivered' | 'deliveredAt'>): 'beforeDelivery' | 'afterDelivery' {
  return deal.delivered || deal.deliveredAt ? 'afterDelivery' : 'beforeDelivery';
}
