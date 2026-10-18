import type { DiscoveryAudience } from '@/features/discovery/model';

export type MarketSectionKey = 'p2p' | 'hiring' | 'b2b';
export type MarketSectionVariant = 'default' | 'hiring' | 'summary';

/// The order of the market's sections (view 17). Every account sees every
/// section; a business workspace only puts business cards first.
export function marketSectionPlan(audience: DiscoveryAudience): { key: MarketSectionKey; variant: MarketSectionVariant }[] {
  if (audience === 'business') {
    return [
      { key: 'b2b', variant: 'default' },
      { key: 'p2p', variant: 'default' },
      { key: 'hiring', variant: 'hiring' },
    ];
  }
  return [
    { key: 'p2p', variant: 'default' },
    { key: 'hiring', variant: 'hiring' },
    { key: 'b2b', variant: 'summary' },
  ];
}
