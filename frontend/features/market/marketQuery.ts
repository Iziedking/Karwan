import type { DiscoveryScope } from '../discovery/model';

/// The one market (view 17) has two views, Find and Your trades, and keeps
/// both in the address so a shared or redirected link opens the right one.

export type MarketView = 'find' | 'yours';
export type YoursList = 'all' | 'requests' | 'offers';

const VIEWS: readonly MarketView[] = ['find', 'yours'];
const SCOPES: readonly DiscoveryScope[] = ['all', 'services', 'business'];
const LISTS: readonly YoursList[] = ['all', 'requests', 'offers'];

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function parseMarketQuery(params: URLSearchParams): { view: MarketView; scope: DiscoveryScope; list: YoursList } {
  return {
    view: pick(params.get('view'), VIEWS, 'find'),
    scope: pick(params.get('scope'), SCOPES, 'all'),
    list: pick(params.get('list'), LISTS, 'all'),
  };
}

export function marketViewHref(view: MarketView, list: YoursList = 'all'): string {
  if (view === 'find') return '/market';
  return list === 'all' ? '/market?view=yours' : `/market?view=yours&list=${list}`;
}

/// Where a missing deal or request sends people: their own trades.
export const YOUR_TRADES_HREF = marketViewHref('yours');
