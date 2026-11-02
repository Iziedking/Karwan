import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { WALLET_HOME, dealRouteBlocked, dealsAvailableOn } from './shared/utils/routes';

const DEALS_AVAILABLE = dealsAvailableOn(process.env.NEXT_PUBLIC_ARC_NETWORK);

function isPrivateRoute(pathname: string): boolean {
  return pathname === '/profile' || /^\/(deals|jobs)(\/|$)/.test(pathname);
}

/// Do not store private HTML in the HTTP cache. Cache-Control does not by
/// itself prevent modern browsers from keeping a document snapshot; the
/// session restore guard also reopens restored product pages through auth.
export function middleware(req: NextRequest) {
  // Where the web deal rail is closed (mainnet), its pages go to the wallet.
  // A deal's own page stays open for the deals people run from chat.
  if (dealRouteBlocked(req.nextUrl.pathname, DEALS_AVAILABLE)) {
    return NextResponse.redirect(new URL(WALLET_HOME, req.url));
  }
  const res = NextResponse.next();
  if (isPrivateRoute(req.nextUrl.pathname)) {
    res.headers.set('Cache-Control', 'no-store, must-revalidate');
  }
  return res;
}

export const config = {
  matcher: [
    '/profile',
    '/app/:path*',
    '/b2b/:path*',
    '/p2p/:path*',
    '/buyer/:path*',
    '/seller/:path*',
    '/supply/:path*',
    '/deals/:path*',
    '/jobs/:path*',
    '/cashout/:path*',
    '/invite/:path*',
    '/market/:path*',
    '/listings/:path*',
    '/partners/:path*',
    '/financier/:path*',
    '/stake/:path*',
    '/legacy/:path*',
    '/business/:path*',
    '/credit-passport/:path*',
    '/x402/:path*',
    '/profile/open-deals',
    '/profile/agent-funds',
    '/profile/business/:path*',
  ],
};
