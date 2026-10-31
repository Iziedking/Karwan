import type { ListingSeller } from '@/core/api';
import type { IconName } from '@/shared/components/Icon';
import type { MarketShopCopy } from '@/shared/i18n/messages/marketShop';
import type { CategoryId } from './marketModel';

/// What a listing card says under its title (view 44, Figma Listing card).

export function deliveryLine(
  kind: 'goods' | 'in_person' | 'remote' | undefined,
  days: number | undefined,
  t: MarketShopCopy,
): string | null {
  if (!days) return null;
  const [one, many] = kind === 'goods' ? [t.shipsInOne, t.shipsIn] : kind === 'in_person' ? [t.readyInOne, t.readyIn] : [t.deliversInOne, t.deliversIn];
  return days === 1 ? one : many.replace('{n}', String(days));
}

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

/// Free stock photos (Unsplash License), one per category, shown when an offer
/// has no photo of its own. On a real seller's offer the card marks it as a
/// sample, so it never passes for their item.
const SAMPLE: Record<CategoryId, string> = {
  design: 'design',
  tech: 'tech',
  phones: 'phones',
  fashion: 'fashion',
  food: 'food',
  farm: 'farm',
  home: 'home',
  lessons: 'lessons',
  repairs: 'repairs',
  rentals: 'rentals',
};

export function samplePhoto(category: CategoryId | null): string {
  return `/market-samples/${category ? SAMPLE[category] : 'default'}.jpg`;
}
