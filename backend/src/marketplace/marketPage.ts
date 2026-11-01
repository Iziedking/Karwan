import type { CategoryId } from '../listings/categories.js';

/// The fields of a public listing the market's Buy side sorts and filters on.
export type MarketRow = {
  id: string;
  title: string;
  description: string;
  postedAt: number;
  expiresAt?: number;
  cancelledAt?: number;
  partyKind?: string;
  tradeLane?: string;
  example: boolean;
  category: CategoryId | null;
};

export type MarketQuery = {
  q?: string;
  category?: CategoryId | 'all';
  scope?: 'all' | 'business';
  limit: number;
  offset?: number;
  now: number;
};

export const MARKET_PAGE_MAX = 240;

/// One page of the Buy side (view 44): open offers only, real ones before
/// examples, newest first, narrowed by category, business scope and the search
/// words the same way the page narrows them. The page asks for what it shows,
/// so the market no longer downloads every offer to draw six cards.
export function marketPage<T extends MarketRow>(rows: readonly T[], f: MarketQuery): { rows: T[]; total: number } {
  const q = (f.q ?? '').trim().toLocaleLowerCase();
  const all = rows
    .filter((row) => !row.cancelledAt && (row.expiresAt ?? Infinity) > f.now)
    .filter((row) => !f.category || f.category === 'all' || row.category === f.category)
    .filter((row) => f.scope !== 'business' || row.tradeLane === 'finance' || row.partyKind === 'business')
    .filter((row) => !q || `${row.title.trim()} ${row.description.trim()}`.toLocaleLowerCase().includes(q))
    .sort((a, b) => Number(a.example) - Number(b.example) || b.postedAt - a.postedAt || a.id.localeCompare(b.id));
  const offset = Math.max(0, f.offset ?? 0);
  const limit = Math.min(MARKET_PAGE_MAX, Math.max(1, f.limit));
  return { rows: all.slice(offset, offset + limit), total: all.length };
}
