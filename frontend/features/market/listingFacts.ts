import type { ListingSeller } from '@/core/api';
import type { IconName } from '@/shared/components/Icon';
import type { MarketShopCopy } from '@/shared/i18n/messages/marketShop';
import { CATEGORY_IDS, type CategoryId } from './marketModel';

/// What a listing card says under its title (view 44, Figma Listing card).

/// Names, never addresses (spec 4.9). With no name or tag, the kind of seller
/// the listing's category makes them.
export function sellerLine(seller: ListingSeller | null, t: MarketShopCopy, category?: CategoryId | null): string {
  return seller?.name || (seller?.tag ? `@${seller.tag}` : category ? t.sellerKinds[category] : t.someone);
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

/// One photograph for each kind of example offer Karwan seeds (view 74).
export const SEED_PHOTOS = [
  'brand-design',
  'social-content',
  'copywriting',
  'game-3d-art',
  'event-planning',
  'web-development',
  'qa-testing',
  'technical-writing',
  'software-ai',
  'smart-contracts',
  'bookkeeping',
  'data-analysis',
  'virtual-assistance',
  'legal-docs',
  'hr-recruiting',
  'photo-video',
  'translation',
  'voice-audio',
  'music-production',
  'tutoring',
  'phones-electronics',
  'fashion-tailoring',
  'home-crafts',
  'beauty-products',
  'packaging-printing',
] as const;

function spread(seed: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % count) + 1;
}

/// Words in a title that name a kind of work we hold a photograph for, the
/// first kind in this order winning. Whole words only, so "api" is not "rapid".
const KIND_WORDS: ReadonlyArray<readonly [(typeof SEED_PHOTOS)[number], readonly string[]]> = [
  ['translation', ['translation', 'translations', 'translator', 'translators', 'translate', 'interpreter']],
  ['tutoring', ['tutor', 'tutors', 'tutoring', 'lesson', 'lessons', 'teacher', 'teaching']],
  ['phones-electronics', ['electronics', 'electronic', 'phone', 'phones', 'iphone', 'laptop', 'laptops', 'gadget', 'gadgets']],
  ['fashion-tailoring', ['tailor', 'tailoring', 'fabric', 'fabrics', 'ankara', 'clothing', 'clothes']],
  ['photo-video', ['photographer', 'photography', 'videographer', 'video editing', 'video editor']],
  ['voice-audio', ['voice over', 'voiceover', 'voice-over', 'podcast']],
  ['music-production', ['music', 'beats', 'mixing', 'mastering']],
  ['copywriting', ['writer', 'writers', 'writing', 'copywriter', 'copywriting', 'blog']],
  ['social-content', ['social media', 'content creator', 'instagram', 'tiktok']],
  ['web-development', ['website', 'websites', 'frontend', 'backend', 'full stack', 'api', 'apis', 'web developer']],
  ['smart-contracts', ['smart contract', 'smart contracts', 'solidity', 'nft', 'web3', 'onchain']],
  ['software-ai', ['software', 'ai', 'automation', 'bot', 'machine learning', 'model building']],
  ['data-analysis', ['data entry', 'data analysis', 'data analyst', 'spreadsheet', 'excel']],
  ['bookkeeping', ['bookkeeping', 'bookkeeper', 'accounting', 'accountant']],
  ['brand-design', ['logo', 'logos', 'branding', 'designer', 'graphic design']],
  ['virtual-assistance', ['virtual assistant', 'assistant', 'project manager']],
];
const KIND_PATTERNS = KIND_WORDS.map(([kind, words]) => [kind, new RegExp(`(^|[^a-z0-9])(${words.join('|')})(?=$|[^a-z0-9])`)] as const);

function kindFromTitle(title: string): string | null {
  const lower = title.toLowerCase();
  return KIND_PATTERNS.find(([, pattern]) => pattern.test(lower))?.[0] ?? null;
}

/// The same listing always shows the same photograph, and a row of listings
/// from one category spreads across that category's photographs. An example
/// offer shows the photograph fitted to its kind of work, and so does an offer
/// or request with no photo whose title names a kind we hold one for.
export function samplePhoto(category: CategoryId | null, seed = '', kind?: 'goods' | 'in_person' | 'remote', examplePhoto?: string | null, title?: string): string {
  if (examplePhoto && (SEED_PHOTOS as readonly string[]).includes(examplePhoto)) return `/market-samples/seed-${examplePhoto}.jpg`;
  const named = title ? kindFromTitle(title) : null;
  if (named) return `/market-samples/seed-${named}.jpg`;
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
