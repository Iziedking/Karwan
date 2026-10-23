import type { AttestedDeal } from '@/core/api';
import type { AttestedDealsCopy } from '@/shared/i18n/messages/attestedDeals';

export interface AttestedRow {
  id: string;
  line: string;
  /// The W3C copy of the statement, served through the site.
  href: string;
  removed: boolean;
}

export const ATTESTED_PAGE_SIZE = 5;

/// One page of rows, the page clamped to what exists.
export function attestedPage<T>(rows: readonly T[], page: number, size = ATTESTED_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  const start = current * size;
  return { rows: rows.slice(start, start + size), page: current, pages, from: rows.length ? start + 1 : 0, to: Math.min(rows.length, start + size) };
}

/// One line per signed statement, newest first: date, role, amount range, and
/// whether it went through a dispute. Never the other person.
export function attestedRows(list: readonly AttestedDeal[], copy: AttestedDealsCopy, locale: string): AttestedRow[] {
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return [...list]
    .sort((a, b) => Date.parse(b.claim.settledAt) - Date.parse(a.claim.settledAt))
    .map((d) => ({
      id: d.id,
      line: [
        date.format(new Date(d.claim.settledAt)),
        d.claim.role === 'buyer' ? copy.buyer : copy.seller,
        copy.bands[d.claim.amountBand] ?? d.claim.amountBand,
        d.claim.viaDispute ? copy.disputed : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/attested/${encodeURIComponent(d.id)}`,
      removed: !!d.revokedAt,
    }));
}
