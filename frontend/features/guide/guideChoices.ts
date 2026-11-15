/// What declining Aman keeps (view 57). The account keeps the guide setting;
/// this visit keeps each page's Not now and the pages that are quiet.

export type GuideSetting = 'on' | 'face' | 'off';

export interface Visit { notNow: Record<string, number>; quiet: string[] }

export const VISIT_KEY = 'karwan:aman:visit';

export const emptyVisit = (): Visit => ({ notNow: {}, quiet: [] });

const page = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname);

export function afterNotNow(visit: Visit, pathname: string): Visit {
  const p = page(pathname);
  const count = (visit.notNow[p] ?? 0) + 1;
  const notNow = { ...visit.notNow, [p]: count };
  return { notNow, quiet: count >= 2 && !visit.quiet.includes(p) ? [...visit.quiet, p] : visit.quiet };
}

export function afterQuietHere(visit: Visit, pathname: string): Visit {
  const p = page(pathname);
  return visit.quiet.includes(p) ? visit : { ...visit, quiet: [...visit.quiet, p] };
}

export function isQuiet(visit: Visit, pathname: string): boolean {
  return visit.quiet.includes(page(pathname));
}

/// The line stays down on a page once it was said, declined or made quiet.
export function hiddenNow(visit: Visit, pathname: string, shownThisPage: boolean): boolean {
  return shownThisPage || isQuiet(visit, pathname) || (visit.notNow[page(pathname)] ?? 0) > 0;
}

export function guideFrom(settings: { guide?: GuideSetting } | null | undefined): GuideSetting {
  const g = settings?.guide;
  return g === 'face' || g === 'off' ? g : 'on';
}

function valid(v: unknown): v is Visit {
  if (!v || typeof v !== 'object') return false;
  const { notNow, quiet } = v as Partial<Visit>;
  return !!notNow && typeof notNow === 'object' && !Array.isArray(notNow)
    && Object.values(notNow).every((n) => typeof n === 'number')
    && Array.isArray(quiet) && quiet.every((q) => typeof q === 'string');
}

export function readVisit(store: Pick<Storage, 'getItem'>): Visit {
  try {
    const raw = store.getItem(VISIT_KEY);
    if (!raw) return emptyVisit();
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : emptyVisit();
  } catch { return emptyVisit(); }
}

export function writeVisit(store: Pick<Storage, 'setItem'>, v: Visit): void {
  try { store.setItem(VISIT_KEY, JSON.stringify(v)); } catch { /* Storage blocked: the choice lasts until the page reloads. */ }
}
