import type { Messages } from '@/shared/i18n/messages/en';

/// The developer docs at karwan.site/developers, one group per kind of
/// integration. A new developer feature adds its page here and the sidebar,
/// search, overview and pager follow.
export type DevPageSlug = '' | 'record-reads' | 'read-format' | 'signing' | 'payment' | 'consent' | 'scoring' | 'paid-data' | 'status';
export type DevGroupKey = 'start' | 'records' | 'agents' | 'help';

export interface DevGroup {
  key: DevGroupKey;
  pages: DevPageSlug[];
}

export const DEV_GROUPS: DevGroup[] = [
  { key: 'start', pages: [''] },
  { key: 'agents', pages: ['paid-data'] },
  { key: 'records', pages: ['record-reads', 'read-format', 'signing', 'payment', 'consent', 'scoring'] },
  { key: 'help', pages: ['status'] },
];

export const DEV_PAGES: DevPageSlug[] = DEV_GROUPS.flatMap((g) => g.pages);

export const devHref = (slug: DevPageSlug) => (slug ? `/developers/${slug}` : '/developers');

export function devPageLabel(m: Messages, slug: DevPageSlug): string {
  const t = m.developers;
  switch (slug) {
    case '': return t.nav.overview;
    case 'record-reads': return t.howHeading;
    case 'read-format': return t.formatHeading;
    case 'signing': return t.signingHeading;
    case 'payment': return t.payHeading;
    case 'consent': return t.rulesHeading;
    case 'scoring': return t.scoringHeading;
    case 'paid-data': return m.x402Page.eyebrow;
    case 'status': return t.nav.statusContact;
  }
}

/// Pages whose label, or group name, contains every word of the query.
export function searchDevPages(m: Messages, query: string): DevPageSlug[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DEV_PAGES;
  return DEV_GROUPS.flatMap((g) =>
    g.pages.filter((slug) => {
      const text = `${devPageLabel(m, slug)} ${m.developers.nav.groups[g.key]}`.toLocaleLowerCase();
      return words.every((w) => text.includes(w));
    }),
  );
}
