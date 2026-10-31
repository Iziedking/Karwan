/// One Market in the navigation for every account (view 17). Everything a
/// person trades from lights it; a deal lights Deals (view 44).

export const MARKET_HREF = '/market';

const MARKET_ROUTES = ['/market', '/listings', '/jobs', '/buyer', '/seller', '/cashout'];

export function isMarketRoute(pathname: string): boolean {
  return MARKET_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
