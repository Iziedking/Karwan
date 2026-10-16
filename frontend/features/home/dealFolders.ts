import type { AmountBand } from '@/core/api';

type FeedDeal = { amountBand: AmountBand; settledAt: number; origin?: 'agent' | 'direct' };

/// The newest settled deals for a folder. With `origin`, only deals the feed
/// says began that way; an untagged row from an older server never counts as
/// an agent deal.
export function folderDeals<T extends FeedDeal>(feed: T[] | undefined, origin?: 'agent' | 'direct', count = 5): T[] {
  return [...(feed ?? [])]
    .filter((deal) => origin === undefined || deal.origin === origin)
    .sort((a, b) => b.settledAt - a.settledAt)
    .slice(0, count);
}

export function agentShare(stats: { total: number; agent: number; settled: number; direct: number } | undefined): number | null {
  if (!stats || !(stats.total > 0)) return null;
  if (![stats.agent, stats.settled, stats.direct].every(Number.isSafeInteger)) return null;
  return Math.floor((stats.agent / stats.total) * 100);
}

/// Where a card sits in the fan: -1 at one edge, 1 at the other, 0 alone.
export function fanSlot(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * 2 - 1;
}

/// Whether the feed tags origin at all. An older server sends none, and then an
/// empty agent folder means unknown, not that no agent deal settled.
export function feedKnowsOrigin(feed: FeedDeal[] | undefined): boolean {
  return (feed ?? []).some((deal) => deal.origin !== undefined);
}
