import type { ListingSeller } from '@/core/api';
import type { IconName } from '@/shared/components/Icon';
import type { MarketShopCopy } from '@/shared/i18n/messages/marketShop';
import { CATEGORY_IDS, type CategoryId } from './marketModel';

/// What a listing card says under its title (view 44, Figma Listing card).

/// Names, never addresses (spec 4.9).
export function sellerLine(seller: ListingSeller | null, t: MarketShopCopy): string {
  return seller?.name || (seller?.tag ? `@${seller.tag}` : t.someone);
}

export const CATEGORY_ICON: Record<CategoryId, IconName> = {
  design: 'pen-tool',
  tech: 'code',
  phones: 'smartphone',
  fashion: 'shirt',
  food: 'utensils',
  farm: 'sprout',
  home: 'sofa',
  lessons: 'graduation-cap',
  repairs: 'wrench',
  rentals: 'key-round',
};

/// Stock photographs (Unsplash License, credits beside the files), several per
/// category, shown when an offer has no photo of its own. On a real seller's
/// offer the card marks it as a sample, so it never passes for their item.
export const SAMPLE_COUNT: Record<CategoryId | 'goods' | 'services', number> = {
  design: 4,
  tech: 4,
  phones: 2,
  fashion: 4,
  food: 4,
  farm: 4,
  home: 4,
  lessons: 4,
  repairs: 4,
  rentals: 3,
  goods: 3,
  services: 4,
};

function spread(seed: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % count) + 1;
}

/// The same listing always shows the same photograph, and a row of listings
/// from one category spreads across that category's photographs.
export function samplePhoto(category: CategoryId | null, seed = '', kind?: 'goods' | 'in_person' | 'remote'): string {
  const group = category ?? (kind === 'goods' ? 'goods' : 'services');
  return `/market-samples/${group}-${spread(seed, SAMPLE_COUNT[group])}.jpg`;
}

/// A listing's category as the server sent it, or none when it is not one of ours.
export function listingCategory(listing: { category?: string | null }): CategoryId | null {
  return (CATEGORY_IDS as readonly string[]).includes(listing.category ?? '') ? (listing.category as CategoryId) : null;
}

/// Which picture a card shows: the seller's own photo whenever it has one that
/// loaded, the category sample only when it has none or it failed, and a plain
/// tile when the sample failed too.
export function cardPicture(photo: string | null | undefined, failed: { own: string | null; sample: boolean }): 'own' | 'sample' | 'tile' {
  if (photo && failed.own !== photo) return 'own';
  return failed.sample ? 'tile' : 'sample';
}
