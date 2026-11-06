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

/// A value band said in the chosen currency (view 55): every figure in "100 to
/// 1,000 USDC" becomes the reader's money and the USDC word goes. With USDC
/// chosen the band reads as written.
export function bandLine(text: string, money?: { currency: string; text: (usdc: number) => string }): string {
  if (!money || money.currency === 'USDC') return text;
  return text
    .replace(/\s*USDC\s*/g, ' ')
    .trim()
    .replace(/\d(?:[\d,   ]*\d)?/g, (figure) => money.text(Number(figure.replace(/[^\d]/g, ''))));
}

/// One line per signed statement, newest first: date, role, amount range, and
/// whether it went through a dispute. Never the other person.
export function attestedRows(list: readonly AttestedDeal[], copy: AttestedDealsCopy, locale: string, money?: { currency: string; text: (usdc: number) => string }): AttestedRow[] {
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return [...list]
    .sort((a, b) => Date.parse(b.claim.settledAt) - Date.parse(a.claim.settledAt))
    .map((d) => ({
      id: d.id,
      line: [
        date.format(new Date(d.claim.settledAt)),
        d.claim.role === 'buyer' ? copy.buyer : copy.seller,
        bandLine(copy.bands[d.claim.amountBand] ?? d.claim.amountBand, money),
        d.claim.viaDispute ? copy.disputed : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/attested/${encodeURIComponent(d.id)}`,
      removed: !!d.revokedAt,
    }));
}
