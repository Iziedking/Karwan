/// The desk's sign-in lives in two cookies that belong to admin.karwan.site
/// (view 79): the session, and which network it is for. The desk's own proxy
/// sets them, reads them and passes the session on; no page script sees it.
/// Neither has an expiry, so closing the browser signs out.

export type DeskNet = 'testnet' | 'mainnet';

const SESSION = 'karwan_desk';
const NET = 'karwan_desk_net';
const ATTRS = 'HttpOnly; Secure; SameSite=Strict; Path=/';

export function sessionCookies(token: string, net: DeskNet): string[] {
  return [`${SESSION}=${token}; ${ATTRS}`, `${NET}=${net}; ${ATTRS}`];
}

export function clearCookies(): string[] {
  return [`${SESSION}=; ${ATTRS}; Max-Age=0`, `${NET}=; ${ATTRS}; Max-Age=0`];
}

/// What to set after the server answered: a refused session clears both, a
/// renewed one replaces the session, anything else changes nothing.
export function cookiesAfter(status: number, renewed: string | null, net: DeskNet): string[] {
  if (status === 401) return clearCookies();
  if (renewed) return [sessionCookies(renewed, net)[0]!];
  return [];
}

export function readDeskCookies(header: string | null): { token: string | null; net: DeskNet } {
  const jar = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const token = jar.get(SESSION) || null;
  return { token, net: jar.get(NET) === 'mainnet' ? 'mainnet' : 'testnet' };
}

/// The server for a network: testnet's is the site's own backend, mainnet's is
/// a separate address set only on the desk's host. Unset, mainnet is not open.
export function deskBackend(net: DeskNet, env: { NEXT_PUBLIC_BACKEND_URL?: string; ADMIN_MAINNET_BACKEND_URL?: string }): string | null {
  const raw = net === 'mainnet' ? env.ADMIN_MAINNET_BACKEND_URL?.trim() : env.NEXT_PUBLIC_BACKEND_URL?.trim() || 'http://localhost:8787';
  return raw ? raw.replace(/\/+$/, '') : null;
}

/// A change must carry the desk's own header, which a page on another site
/// cannot send without a preflight this proxy never answers.
export function refusesChange(method: string, headers: Headers): boolean {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD') return false;
  return headers.get('x-karwan-desk') !== '1';
}
