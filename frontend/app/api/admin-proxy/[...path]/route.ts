import { NextResponse, type NextRequest } from 'next/server';
import { adminProxyTarget } from '@/shared/admin/adminDesk';
import { clearCookies, cookiesAfter, deskBackend, readDeskCookies, refusesChange, sessionCookies, type DeskNet } from '@/shared/admin/deskCookies';

/// Every admin call from the desk comes here on admin.karwan.site and is passed
/// to the backend with Cloudflare Access's pass, which the backend checks again
/// (view 64). The middleware has already refused anything without a valid pass.
///
/// The sign-in is this address's own (view 79): the session lives in a cookie
/// no page script can read, this proxy adds it to each call, writes back the
/// renewed one, and sends the call to the server of the network chosen at
/// sign-in.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARD_HEADERS = ['content-type', 'x-desk-reason', 'cf-access-jwt-assertion'];
const SIGN_IN = new Set(['session', 'session/code']);

function env() {
  return { NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL, ADMIN_MAINNET_BACKEND_URL: process.env.ADMIN_MAINNET_BACKEND_URL };
}

function withCookies(res: NextResponse, cookies: string[]): NextResponse {
  for (const c of cookies) res.headers.append('set-cookie', c);
  return res;
}

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = (path ?? []).join('/');

  // Which desks are open, for the sign-in screen.
  if (joined === 'desks' && req.method === 'GET') {
    return NextResponse.json({ mainnet: deskBackend('mainnet', env()) !== null }, { headers: { 'cache-control': 'no-store' } });
  }

  const target = adminProxyTarget(path ?? []);
  if (!target) return new NextResponse('Not found', { status: 404 });
  if (refusesChange(req.method, req.headers)) return NextResponse.json({ error: 'Refused.' }, { status: 403 });

  const jar = readDeskCookies(req.headers.get('cookie'));
  let net: DeskNet = jar.net;
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : undefined;
  const signingIn = req.method === 'POST' && target === '/api/admin/session';
  if (signingIn && body) {
    try {
      const chosen = (JSON.parse(new TextDecoder().decode(body)) as { network?: unknown }).network;
      net = chosen === 'mainnet' ? 'mainnet' : 'testnet';
    } catch {
      net = 'testnet';
    }
  }
  const backend = deskBackend(net, env());
  if (!backend) return NextResponse.json({ error: 'The mainnet desk is not open yet.' }, { status: 503 });

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (jar.token && !signingIn) headers.set('x-admin-token', jar.token);

  const res = await fetch(`${backend}${target}${req.nextUrl.search}`, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const out = new Headers({ 'cache-control': 'no-store' });
  const type = res.headers.get('content-type');
  if (type) out.set('content-type', type);

  const signInStep = req.method === 'POST' && SIGN_IN.has(joined.replace(/^api\/admin\//, ''));
  if (signInStep && res.ok) {
    const answer = (await res.json()) as { token?: string; [k: string]: unknown };
    const { token, ...rest } = answer;
    const reply = NextResponse.json(rest, { status: res.status, headers: out });
    // The network is remembered from the password step, so the code step goes
    // to the same server; the session cookie arrives once fully signed in.
    return withCookies(reply, token ? sessionCookies(token, net) : [sessionCookies('', net)[1]!]);
  }
  if (req.method === 'DELETE' && target === '/api/admin/session') {
    return withCookies(new NextResponse(res.body, { status: res.status, headers: out }), clearCookies());
  }
  const reply = new NextResponse(res.body, { status: res.status, headers: out });
  return withCookies(reply, signingIn ? [] : cookiesAfter(res.status, res.headers.get('x-desk-session'), net));
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
