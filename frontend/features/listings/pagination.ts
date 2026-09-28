/// Four rows of three on desktop, so a page ends on a full row.
export const MARKET_PAGE_SIZE = 12;

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

/// The slice for one page. A page past the end (the list shrank on refresh) or
/// below one lands on the nearest real page instead of an empty screen.
export function pageItems<T>(items: readonly T[], requested: number, size = MARKET_PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(requested) || 1), pageCount);
  const start = (page - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page, pageCount, from: total === 0 ? 0 : start + 1, to: start + slice.length, total };
}

/// Page numbers to show: all of them when there are few, otherwise the first,
/// the last and the current page's neighbours, with a gap between runs.
export function pageWindow(current: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const keep = new Set([1, pageCount, current - 1, current, current + 1]);
  if (current <= 3) [2, 3].forEach((n) => keep.add(n));
  if (current >= pageCount - 2) [pageCount - 2, pageCount - 1].forEach((n) => keep.add(n));
  const pages = [...keep].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1]! > 1) out.push('gap');
    out.push(n);
  });
  return out;
}
