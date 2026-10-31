import { MARKET_HREF } from './marketNav';

/// The places a signed-in person moves between (view 44). The phone bar has
/// four, so Messages open from people, listings and the bell (D11); the desktop
/// rail has room for Money and Messages, with the person at its foot (D8).
export type NavItemId = 'home' | 'market' | 'deals' | 'money' | 'messages' | 'finance' | 'activity' | 'profile';

export const DEALS_HREF = '/deals';

export function workspaceNavItems(input: {
  surface: 'phone' | 'desktop';
  dealsAvailable: boolean;
  financeEnabled: boolean;
}): NavItemId[] {
  // Where deals are off, Home is the wallet itself, so Money is not repeated.
  if (!input.dealsAvailable) return input.surface === 'phone' ? ['home', 'activity', 'profile'] : ['home', 'activity'];
  if (input.surface === 'phone') return ['home', 'market', 'deals', 'profile'];
  return ['home', 'market', 'deals', 'money', 'messages', ...(input.financeEnabled ? (['finance'] as const) : [])];
}

const HREF: Record<Exclude<NavItemId, 'home'>, string> = {
  market: MARKET_HREF,
  deals: DEALS_HREF,
  money: '/account',
  messages: '/messages',
  finance: '/financier',
  activity: '/activity',
  profile: '/profile',
};

export function navHref(id: NavItemId, homeHref: string): string {
  return id === 'home' ? homeHref : HREF[id];
}
