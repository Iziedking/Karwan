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
