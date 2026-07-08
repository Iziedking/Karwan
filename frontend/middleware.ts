import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/// Private, per-account surfaces must not be restorable from Chrome's back/forward
/// cache (bfcache). On a shared device (log out of A, log in as B in the same tab)
/// bfcache can otherwise repaint account A's fully-rendered page — the DOM and JS
/// heap are snapshotted live, so it shows A's data before B's fetch runs. A page
/// served with `Cache-Control: no-store` is ineligible for bfcache, so the browser
/// rebuilds it fresh (and the app's own auth gate + fetch run against the current
/// session). Public/shareable routes (landing, market, credit-passport) are left
/// alone so they keep their instant-restore snappiness.
export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, must-revalidate');
  return res;
}

export const config = {
  matcher: ['/deals/:path*', '/jobs/:path*', '/profile'],
};
