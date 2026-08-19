import type { Listing, MarketplaceBrief, Partner } from '@/core/api';

export type DiscoverySide = 'offer' | 'request';
export type DiscoveryScope = 'all' | 'services' | 'business';
export type DiscoverySort = 'newest' | 'price-asc' | 'price-desc';
export type DiscoveryAudience = 'public' | 'person' | 'business';
export type DiscoveryRail = 'personal' | 'hiring' | 'business';

export interface DiscoveryCard {
  side: DiscoverySide;
  id: string;
  href: string;
  title: string;
  body: string;
  priceUsdc: number;
  postedAt: number;
  availableUntil: number;
  partyAddress: string;
  partyKind: 'person' | 'business';
  tradeLane: 'service' | 'finance';
  partyIsYou: boolean;
  matchedBefore: boolean;
  bidsCount?: number;
}

export interface DiscoveryFilters {
  query: string;
  side: 'all' | DiscoverySide;
  scope: DiscoveryScope;
  sort: DiscoverySort;
}

export function buildDiscoveryCards(
  listings: Listing[],
  briefs: MarketplaceBrief[],
  options: { viewerAddress?: string | null; now?: number } = {},
): DiscoveryCard[] {
  const now = options.now ?? Date.now();
  const viewer = options.viewerAddress?.toLowerCase();

  const offers: DiscoveryCard[] = listings
    .filter((listing) => !listing.cancelledAt && (listing.expiresAt ?? Infinity) > now)
    .map((listing) => ({
      side: 'offer',
      id: listing.id,
      href: `/listings/${listing.id}`,
      title: listing.title.trim() || 'Untitled offer',
      body: listing.description.trim(),
      priceUsdc: listing.askingPriceUsdc,
      postedAt: listing.postedAt,
      availableUntil: listing.expiresAt,
      partyAddress: listing.sellerUser,
      partyKind: listing.partyKind ?? 'person',
      tradeLane: listing.tradeLane ?? 'service',
      partyIsYou: !!viewer && listing.sellerUser.toLowerCase() === viewer,
      matchedBefore: !!listing.matchedAt,
    }));

  const requests: DiscoveryCard[] = briefs
    .filter((brief) => brief.deadlineUnix * 1000 > now)
    .map((brief) => {
      const raw = brief.briefText.trim();
      const [firstLine = '', ...rest] = raw.split('\n');
      const title = firstLine.slice(0, 80).trim() || `Request ${brief.jobId.slice(0, 10)}`;
      const overflow = firstLine.length > 80 ? firstLine.slice(80).trim() : '';
      const body = [overflow, ...rest].filter(Boolean).join(' ').trim();
      return {
        side: 'request',
        id: brief.jobId,
        href: `/jobs/${brief.jobId}`,
        title,
        body,
        priceUsdc: Number(brief.budgetUsdc),
        postedAt: brief.postedAt,
        availableUntil: brief.deadlineUnix * 1000,
        partyAddress: brief.buyer,
        partyKind: brief.partyKind ?? 'person',
        tradeLane: brief.tradeLane ?? 'service',
        partyIsYou: false,
        matchedBefore: false,
        bidsCount: brief.bidsCount,
      } satisfies DiscoveryCard;
    });

  return [...offers, ...requests].sort(compareNewest);
}

export function discoveryRail(card: DiscoveryCard): DiscoveryRail {
  if (card.tradeLane === 'finance') return 'business';
  if (card.partyKind === 'business') return 'hiring';
  return 'personal';
}

export function isVisibleToAudience(
  card: DiscoveryCard,
  audience: DiscoveryAudience,
): boolean {
  if (audience !== 'business') return true;
  return discoveryRail(card) !== 'personal';
}

export function filterDiscoveryCards(
  cards: DiscoveryCard[],
  filters: DiscoveryFilters,
  audience: DiscoveryAudience,
): DiscoveryCard[] {
  const query = normalize(filters.query);
  return cards
    .filter((card) => isVisibleToAudience(card, audience))
    .filter((card) => filters.side === 'all' || card.side === filters.side)
    .filter((card) => {
      if (filters.scope === 'all') return true;
      if (filters.scope === 'services') return card.tradeLane === 'service';
      return card.tradeLane === 'finance' || card.partyKind === 'business';
    })
    .filter((card) => {
      if (!query) return true;
      return normalize(
        `${card.title} ${card.body} ${card.side} ${card.partyKind} ${card.tradeLane}`,
      ).includes(query);
    })
    .sort((a, b) => {
      if (filters.sort === 'price-asc') return comparePrice(a, b);
      if (filters.sort === 'price-desc') return comparePrice(b, a);
      return compareNewest(a, b);
    });
}

export type PartnerSort = 'trust' | 'name';

export interface PartnerFilters {
  query: string;
  sector: string;
  verifiedOnly: boolean;
  sort: PartnerSort;
}

export function filterPartners(partners: Partner[], filters: PartnerFilters): Partner[] {
  const query = normalize(filters.query);
  return partners
    .filter((partner) => !filters.sector || partner.sector === filters.sector)
    .filter((partner) => !filters.verifiedOnly || partner.verified)
    .filter((partner) => {
      if (!query) return true;
      return normalize(
        [
          partner.name,
          partner.sector,
          partner.region,
          partner.primaryMarkets,
          partner.certifications,
        ]
          .filter(Boolean)
          .join(' '),
      ).includes(query);
    })
    .sort((a, b) => {
      if (filters.sort === 'name') return a.name.localeCompare(b.name);
      return Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name);
    });
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function compareNewest(a: DiscoveryCard, b: DiscoveryCard): number {
  return b.postedAt - a.postedAt || a.id.localeCompare(b.id);
}

function comparePrice(a: DiscoveryCard, b: DiscoveryCard): number {
  return a.priceUsdc - b.priceUsdc || compareNewest(a, b);
}
