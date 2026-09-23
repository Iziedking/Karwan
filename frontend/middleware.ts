import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { WALLET_HOME, dealsAvailableOn, isDealRoute } from './shared/utils/routes';

const DEALS_AVAILABLE = dealsAvailableOn(process.env.NEXT_PUBLIC_ARC_NETWORK);

function isPrivateRoute(pathname: string): boolean {
  return pathname === '/profile' || /^\/(deals|jobs)(\/|$)/.test(pathname);
}

/// Private, per-account surfaces must not be restorable from Chrome's back/forward
/// cache (bfcache). On a shared device (log out of A, log in as B in the same tab)
/// bfcache can otherwise repaint account A's fully-rendered page — the DOM and JS
/// heap are snapshotted live, so it shows A's data before B's fetch runs. A page
/// served with `Cache-Control: no-store` is ineligible for bfcache, so the browser
/// rebuilds it fresh (and the app's own auth gate + fetch run against the current
/// session). Public/shareable routes (landing, market, credit-passport) are left
/// alone so they keep their instant-restore snappiness.
export function middleware(req: NextRequest) {
  // A wallet-only deployment has no deal contracts, so deal pages would only
  // show errors. Send them to the wallet instead.
  if (!DEALS_AVAILABLE && isDealRoute(req.nextUrl.pathname)) {
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
  ],
};
