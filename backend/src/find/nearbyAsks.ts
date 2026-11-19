import { topicalMatchScore } from '../llm/keywords.js';
import type { PrivateLocation } from '../location/rules.js';

/// What "Where are you" shows at setup (view 39, 19 Nov): how many people in
/// the person's city are asking for what they sell (or sell what they need),
/// only from three people up so nobody is singled out. The asks listed come
/// from the whole country and carry only what was asked and the budget.

export const NEARBY_MIN = 3;
export const NEARBY_ROWS = 3;

export interface Ask {
  buyer: string;
  what: string;
  keywords: string[];
  budgetUsdc: number | null;
  buyerLocation: PrivateLocation | null;
  /// On the open market; private asks are never read.
  open: boolean;
}

export interface NearbyQuery {
  me: string;
  words: string[];
  country: string;
  city: string | null;
}

export interface Nearby {
  count: number;
  rows: Array<{ what: string; budgetUsdc: number | null }>;
}

const NONE: Nearby = { count: 0, rows: [] };
const sameText = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function nearbyAsks(asks: readonly Ask[], q: NearbyQuery): Nearby {
  if (!q.city || q.words.length === 0) return NONE;
  const me = q.me.toLowerCase();
  const fits = asks.filter((a) => a.open && a.buyer.toLowerCase() !== me && sameText(a.buyerLocation?.country, q.country) && topicalMatchScore(a.keywords, q.words) > 0);
  const people = new Set(fits.filter((a) => sameText(a.buyerLocation?.city, q.city)).map((a) => a.buyer.toLowerCase()));
  if (people.size < NEARBY_MIN) return NONE;
  return { count: people.size, rows: fits.slice(0, NEARBY_ROWS).map((a) => ({ what: a.what, budgetUsdc: a.budgetUsdc })) };
}

export function nearbySellers(sellers: ReadonlyArray<{ user: string; words: string[]; location: PrivateLocation | null }>, q: NearbyQuery): Nearby {
  if (!q.city || q.words.length === 0) return NONE;
  const me = q.me.toLowerCase();
  const people = new Set(
    sellers
      .filter((s) => s.user.toLowerCase() !== me && sameText(s.location?.country, q.country) && sameText(s.location?.city, q.city) && topicalMatchScore(q.words, s.words) > 0)
      .map((s) => s.user.toLowerCase()),
  );
  return people.size < NEARBY_MIN ? NONE : { count: people.size, rows: [] };
}
