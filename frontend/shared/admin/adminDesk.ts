/// Where the admin desk may be opened (view 64). It lives only on its own
/// address, admin.karwan.site, behind Cloudflare Access. The public site has no
/// /admin, and every admin API call goes through this site's own proxy, which
/// forwards Cloudflare's pass to the backend.

export const ADMIN_PROXY_PREFIX = '/api/admin-proxy';

export function isAdminPath(pathname: string): boolean {
  return /^\/admin(\/|$)/.test(pathname) || pathname.startsWith(`${ADMIN_PROXY_PREFIX}/`);
}

export type AdminGate = 'pass' | 'not-found' | 'to-desk' | 'check-pass';

export function adminGate(input: {
  host: string | null;
  pathname: string;
  adminHost: string | undefined;
  production: boolean;
}): AdminGate {
  const host = (input.host ?? '').toLowerCase().replace(/:\d+$/, '');
  const adminHost = input.adminHost?.trim().toLowerCase();
  const adminPath = isAdminPath(input.pathname);
  if (!adminHost) {
    if (!adminPath) return 'pass';
    return input.production ? 'not-found' : 'pass';
  }
  if (host !== adminHost) return adminPath ? 'not-found' : 'pass';
  if (input.pathname === '/') return 'to-desk';
  return adminPath ? 'check-pass' : 'pass';
}

/// The backend routes the desk calls. Anything else is not forwarded, so the
/// proxy is never a general way into the API.
const FORWARDED = [
  /^api\/admin\/[^?#]*$/,
  /^api\/feedback(\/[^/?#]+\/status|\/[^/?#]+\/asset\/\d+)?$/,
  /^api\/listings\/[^/?#]+\/photos\/clear$/,
  /^api\/financier\/admin\/review$/,
];

export function adminProxyTarget(segments: string[]): string | null {
  if (segments.some((s) => !s || s === '.' || s === '..' || s.includes('/') || s.includes('\\'))) return null;
  const path = segments.join('/');
  return FORWARDED.some((re) => re.test(path)) ? `/${path}` : null;
}

/// The same-origin address an admin call is sent to from the desk.
export function adminApiUrl(path: string): string {
  return `${ADMIN_PROXY_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}
