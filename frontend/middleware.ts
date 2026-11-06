import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { WALLET_HOME, dealRouteBlocked, dealsAvailableOn } from './shared/utils/routes';
import { adminGate } from './shared/admin/adminDesk';
import { accessKeys, accessPassValid } from './shared/admin/accessPass';

const DEALS_AVAILABLE = dealsAvailableOn(process.env.NEXT_PUBLIC_ARC_NETWORK);

function isPrivateRoute(pathname: string): boolean {
  return pathname === '/profile' || /^\/(deals|jobs)(\/|$)/.test(pathname);
}

/// Do not store private HTML in the HTTP cache. Cache-Control does not by
/// itself prevent modern browsers from keeping a document snapshot; the
/// session restore guard also reopens restored product pages through auth.
function notFound() {
  return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

/// The admin desk opens only on its own address, and only for a request
/// Cloudflare Access let through (view 64).
async function adminDesk(req: NextRequest): Promise<NextResponse | null> {
  const gate = adminGate({
    host: req.headers.get('host'),
    pathname: req.nextUrl.pathname,
    adminHost: process.env.ADMIN_HOST,
    production: process.env.NODE_ENV === 'production',
  });
  if (gate === 'pass') return null;
  if (gate === 'not-found') return notFound();
  if (gate === 'to-desk') return NextResponse.redirect(new URL('/admin', req.url));
  const teamDomain = process.env.ADMIN_ACCESS_TEAM_DOMAIN;
  const aud = process.env.ADMIN_ACCESS_AUD;
  const token = req.headers.get('cf-access-jwt-assertion') ?? '';
  if (!teamDomain || !aud || !token) return notFound();
  const opts = { teamDomain, aud, nowMs: Date.now() };
  try {
    if (await accessPassValid(token, await accessKeys(teamDomain), opts)) return null;
    if (await accessPassValid(token, await accessKeys(teamDomain, true), opts)) return null;
  } catch {
    return notFound();
  }
  return notFound();
}

export async function middleware(req: NextRequest) {
  const desk = await adminDesk(req);
  if (desk) return desk;
  // Where the web deal rail is closed (mainnet), its pages go to the wallet.
  // A deal's own page stays open for the deals people run from chat.
  if (dealRouteBlocked(req.nextUrl.pathname, DEALS_AVAILABLE)) {
    return NextResponse.redirect(new URL(WALLET_HOME, req.url));
  }
  const res = NextResponse.next();
  if (isPrivateRoute(req.nextUrl.pathname) || req.nextUrl.pathname.startsWith('/admin')) {
    res.headers.set('Cache-Control', 'no-store, must-revalidate');
  }
  return res;
}

export const config = {
  matcher: [
    '/',
    '/admin',
    '/admin/:path*',
    '/api/admin-proxy/:path*',
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
