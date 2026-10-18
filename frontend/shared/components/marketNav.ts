/// One Market in the navigation for every account (view 17). Everything a
/// person trades from, including a deal and its cash-out, lights it.

export const MARKET_HREF = '/market';

const MARKET_ROUTES = ['/market', '/listings', '/jobs', '/buyer', '/seller', '/deals', '/cashout'];

export function isMarketRoute(pathname: string): boolean {
  return MARKET_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
