import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { WALLET_HOME, dealRouteBlocked, dealsAvailableOn } from './shared/utils/routes';
import { adminGate } from './shared/admin/adminDesk';
import { deskRedirectFor } from './features/admin/deskRedirects.mjs';
import { accessKeys, accessPassValid } from './shared/admin/accessPass';
import { buildCsp, cspHeaderName, cspMode, makeNonce, originsOf } from './shared/security/csp';
import { REGION_COOKIE, regionFromHeader } from './shared/utils/region';

const DEALS_AVAILABLE = dealsAvailableOn(process.env.NEXT_PUBLIC_ARC_NETWORK);

const API_ORIGIN = originsOf([process.env.NEXT_PUBLIC_BACKEND_URL])[0] ?? null;
const REPORT_URL = API_ORIGIN ? `${API_ORIGIN}/api/security/csp-report` : null;
const CSP_HEADER = cspHeaderName(cspMode(process.env.CSP_MODE));
/// RPCs and the Circle client named in settings, written out so Next.js
/// inlines each value at build time.
const SETTING_ORIGINS = originsOf([
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC,
  process.env.NEXT_PUBLIC_SEPOLIA_RPC,
  process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC,
  process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC,
  process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC,
  process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC,
  process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL,
]);

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
  // Old desk addresses move only once the gate has let the request in.
  const moved = deskRedirectFor(req.nextUrl.pathname);
  if (moved) return NextResponse.redirect(new URL(moved, req.url), 307);
  // Where the web deal rail is closed (mainnet), its pages go to the wallet.
  // A deal's own page stays open for the deals people run from chat.
  if (dealRouteBlocked(req.nextUrl.pathname, DEALS_AVAILABLE)) {
    return NextResponse.redirect(new URL(WALLET_HOME, req.url));
  }
  // The page policy (view 70): a fresh nonce per load. Next.js reads the
  // policy from the request headers and puts the nonce on its own scripts.
  const nonce = makeNonce();
  const policy = buildCsp({ nonce, apiOrigin: API_ORIGIN, extraConnect: SETTING_ORIGINS, reportUrl: REPORT_URL });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(CSP_HEADER, policy);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(CSP_HEADER, policy);
  if (REPORT_URL) res.headers.set('Reporting-Endpoints', `csp="${REPORT_URL}"`);
  // The visitor's country, so prices read in local money before sign-in (view 74).
  const region = regionFromHeader(req.headers.get('cf-ipcountry'));
  if (region && req.cookies.get(REGION_COOKIE)?.value !== region) {
    res.cookies.set(REGION_COOKIE, region, { path: '/', sameSite: 'lax', maxAge: 86_400, secure: process.env.NODE_ENV === 'production' });
  }
  if (isPrivateRoute(req.nextUrl.pathname) || req.nextUrl.pathname.startsWith('/admin')) {
    res.headers.set('Cache-Control', 'no-store, must-revalidate');
  }
  return res;
}

/// Every page, so each gets the page policy; built files and images are skipped.
export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|txt|xml|webmanifest|woff2?|mp3|mp4|pdf)$).*)',
    },
  ],
};
