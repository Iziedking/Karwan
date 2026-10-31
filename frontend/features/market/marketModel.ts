import type { DiscoveryCard, DiscoveryScope } from '../discovery/model';

/// The market's categories, the same ids in the same order as the server
/// (backend/src/listings/categories.ts; its test reads this list).
export const CATEGORY_IDS = ['design', 'tech', 'phones', 'fashion', 'food', 'farm', 'home', 'lessons', 'repairs', 'rentals'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

const FRESH = 6;

const newest = (a: DiscoveryCard, b: DiscoveryCard) => b.postedAt - a.postedAt || a.id.localeCompare(b.id);

/// Buy: offers only, real ones before examples, newest first. `fresh` is the
/// top of that list for "New on Karwan".
export function buyCards(
  cards: readonly DiscoveryCard[],
  f: { q: string; category: CategoryId | 'all'; scope: DiscoveryScope },
): { fresh: DiscoveryCard[]; all: DiscoveryCard[] } {
  const q = f.q.trim().toLocaleLowerCase();
  const all = cards
    .filter((card) => card.side === 'offer')
    .filter((card) => f.category === 'all' || card.category === f.category)
    .filter((card) => f.scope !== 'business' || card.tradeLane === 'finance' || card.partyKind === 'business')
    .filter((card) => !q || `${card.title} ${card.body}`.toLocaleLowerCase().includes(q))
    .sort((a, b) => Number(a.example) - Number(b.example) || newest(a, b));
  return { fresh: all.slice(0, FRESH), all };
}

/// Sell: what buyers need, the requests that fit you first. Signed out,
/// nothing is marked.
export function sellRequests(
  cards: readonly DiscoveryCard[],
  fits: ReadonlySet<string> | null,
): Array<DiscoveryCard & { fits: boolean }> {
  return cards
    .filter((card) => card.side === 'request')
    .map((card) => ({ ...card, fits: !!fits?.has(card.id.toLowerCase()) }))
    .sort((a, b) => Number(b.fits) - Number(a.fits) || newest(a, b));
}
