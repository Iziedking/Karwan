import type { DiscoveryScope } from '../discovery/model';
import { CATEGORY_IDS, type CategoryId } from './marketModel';

/// The one market (view 17) has two views, Find and Your trades, and keeps
/// both in the address so a shared or redirected link opens the right one.
/// Find has a Buy and a Sell side, a category and a search (view 44).

export type MarketView = 'find' | 'yours';
export type YoursList = 'all' | 'requests' | 'offers';
export type MarketSide = 'buy' | 'sell';

const VIEWS: readonly MarketView[] = ['find', 'yours'];
const SCOPES: readonly DiscoveryScope[] = ['all', 'services', 'business'];
const LISTS: readonly YoursList[] = ['all', 'requests', 'offers'];
const SIDES: readonly MarketSide[] = ['buy', 'sell'];
const SEARCH_LIMIT = 120;

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function parseMarketQuery(params: URLSearchParams): {
  view: MarketView;
  scope: DiscoveryScope;
  list: YoursList;
  side: MarketSide;
  category: CategoryId | 'all';
  q: string;
} {
  return {
    view: pick(params.get('view'), VIEWS, 'find'),
    scope: pick(params.get('scope'), SCOPES, 'all'),
    list: pick(params.get('list'), LISTS, 'all'),
    side: pick(params.get('side'), SIDES, 'buy'),
    category: pick<CategoryId | 'all'>(params.get('category'), CATEGORY_IDS, 'all'),
    q: (params.get('q') ?? '').trim().slice(0, SEARCH_LIMIT),
  };
}

/// The address of one Find view, leaving defaults out.
export function marketHref({ side, category, q, scope = 'all' }: { side: MarketSide; category: CategoryId | 'all'; q: string; scope?: DiscoveryScope }): string {
  const params = new URLSearchParams();
  if (scope === 'business') params.set('scope', 'business');
  if (side === 'sell') params.set('side', 'sell');
  if (category !== 'all') params.set('category', category);
  if (q.trim()) params.set('q', q.trim());
  const query = params.toString();
  return query ? `/market?${query}` : '/market';
}

export function marketViewHref(view: MarketView, list: YoursList = 'all'): string {
  if (view === 'find') return '/market';
  return list === 'all' ? '/market?view=yours' : `/market?view=yours&list=${list}`;
}

/// Where a missing deal or request sends people: their own trades.
export const YOUR_TRADES_HREF = marketViewHref('yours');
