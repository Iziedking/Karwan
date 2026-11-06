import { NextResponse, type NextRequest } from 'next/server';
import { adminProxyTarget } from '@/shared/admin/adminDesk';

/// Every admin call from the desk comes here on admin.karwan.site and is passed
/// to the backend with Cloudflare Access's pass, which the backend checks again
/// (view 64). The middleware has already refused anything without a valid pass.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || 'http://localhost:8787').replace(/\/+$/, '');
const FORWARD_HEADERS = ['content-type', 'x-admin-token', 'x-desk-reason', 'cf-access-jwt-assertion'];

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = adminProxyTarget(path ?? []);
  if (!target) return new NextResponse('Not found', { status: 404 });

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const res = await fetch(`${BACKEND}${target}${req.nextUrl.search}`, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });
  const out = new Headers({ 'cache-control': 'no-store' });
  const type = res.headers.get('content-type');
  if (type) out.set('content-type', type);
  return new NextResponse(res.body, { status: res.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
