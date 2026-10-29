/// One page of a list, five rows at a time unless asked otherwise. A page past
/// the end, as after the last row of a page is settled, falls back to the last
/// page that still has rows.
export const PAGE_SIZE = 5;

export interface Paged<T> {
  rows: T[];
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function paged<T>(items: readonly T[], page: number, size = PAGE_SIZE): Paged<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const at = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const start = at * size;
  const rows = items.slice(start, start + size);
  return {
    rows,
    page: at,
    pages,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
    total,
    hasPrev: at > 0,
    hasNext: at < pages - 1,
  };
}
