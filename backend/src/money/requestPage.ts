const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/// A list page from the query string. The cursor is the sort time of the last
/// row already shown; anything that is not a positive whole number is ignored.
export function parsePageQuery(query: { limit?: string; before?: string }): { limit: number; before: number | undefined } {
  const limit = Number(query.limit);
  const before = Number(query.before);
  return {
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT,
    before: Number.isInteger(before) && before > 0 ? before : undefined,
  };
}

/// Rows were read with one extra; that extra row only says another page exists.
export function pageOf<T>(rows: T[], limit: number, key: (row: T) => number): { items: T[]; next: number | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, next: rows.length > limit && last ? key(last) : null };
}
