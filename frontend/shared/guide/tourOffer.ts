/// The page tour with Aman is offered, never forced (view 57, 15 Nov evening):
/// someone new, on their first visit to one of four pages, is asked once.

export type TourPage = 'home' | 'market' | 'deal' | 'money';

export function tourPage(pathname: string): TourPage | null {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === '/app') return 'home';
  if (p === '/market') return 'market';
  if (/^\/deals\/[^/]+$/.test(p)) return 'deal';
  if (p === '/account') return 'money';
  return null;
}

export function tourOffer(s: { newcomer: boolean; offerOff: boolean; pathname: string; tourSeen: boolean; hasTour: boolean }): boolean {
  return s.newcomer && !s.offerOff && !s.tourSeen && s.hasTour && tourPage(s.pathname) !== null;
}
