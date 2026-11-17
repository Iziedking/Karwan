import type { QuestionKey } from '@/shared/i18n/messages/guide';

/// New here? (view 57, 17 Nov): someone new sees one line with three questions
/// on Home, the market, a deal and Money. A question opens the assistant with
/// it asked; Not now keeps it away on every device.

export type NewHerePage = 'home' | 'market' | 'deal' | 'money';

export const NEW_HERE_QUESTIONS: Record<NewHerePage, readonly [QuestionKey, QuestionKey, QuestionKey]> = {
  home: ['home.first', 'home.findSeller', 'home.getPaid'],
  market: ['market.safe', 'market.post', 'market.cost'],
  deal: ['deal.money', 'deal.approvePart', 'deal.moveDate'],
  money: ['money.where', 'money.withdraw', 'money.agent'],
};

/// Seen this visit, per page, in sessionStorage.
export const NEW_HERE_SEEN = (page: NewHerePage) => `karwan:aman:new-here:${page}`;

export function newHerePage(pathname: string): NewHerePage | null {
  const path = pathname.split(/[?#]/)[0]!;
  if (path === '/app') return 'home';
  if (path === '/market') return 'market';
  if (path === '/account') return 'money';
  if (/^\/deals\/[^/]+$/.test(path)) return 'deal';
  return null;
}

export function newHereFits(a: { newcomer: boolean; pathname: string; off: boolean; urgent: boolean; seen: boolean }): boolean {
  return a.newcomer && !a.off && !a.urgent && !a.seen && newHerePage(a.pathname) !== null;
}

/// An account that turned the old tour offer off counts as off too.
export function newHereOff(settings?: { guideNewHere?: 'off'; guideTourOffer?: 'off' }): boolean {
  return settings?.guideNewHere === 'off' || settings?.guideTourOffer === 'off';
}
