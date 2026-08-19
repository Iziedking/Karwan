export type ShellSurface = 'public' | 'workspace' | 'focused' | 'bare' | 'admin';

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * Public editorial surfaces. These always use the public header and footer,
 * even when the visitor already has an account. They must never trigger an
 * account signature, terms gate, product tour, or authenticated assistant.
 */
export function isPublicEditorialRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return [
    '/',
    '/how-it-works',
    '/brand',
    '/newsletter',
    '/docs',
    '/terms',
    '/feedback',
    '/credit-passport',
    '/x402',
  ].some((route) => matchesRoute(pathname, route));
}

/**
 * Discovery pages work before sign-in, but become part of the application
 * workspace once a user is authenticated. This lets a visitor browse first
 * without losing the persistent workspace navigation after they sign in.
 */
export function isPublicDiscoveryRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ['/market', '/listings', '/partners'].some((route) => matchesRoute(pathname, route));
}

/** Routes that may be read without starting the account authentication flow. */
export function isPublicAccessRoute(pathname: string | null | undefined): boolean {
  return isPublicEditorialRoute(pathname) || isPublicDiscoveryRoute(pathname);
}

/** Task flows that keep identity controls but remove navigation distractions. */
export function isFocusedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return matchesRoute(pathname, '/onboarding') || matchesRoute(pathname, '/cashout');
}

/** First-contact invitation pages own their complete page shell. */
export function isBareRoute(pathname: string | null | undefined): boolean {
  return !!pathname && matchesRoute(pathname, '/invite');
}

export function getShellSurface(
  pathname: string | null | undefined,
  isAuthenticated: boolean,
): ShellSurface {
  if (isBareRoute(pathname)) return 'bare';
  if (isFocusedRoute(pathname)) return 'focused';
  if (pathname && matchesRoute(pathname, '/admin')) return 'admin';
  if (isPublicEditorialRoute(pathname)) return 'public';
  if (isPublicDiscoveryRoute(pathname) && !isAuthenticated) return 'public';
  return 'workspace';
}

/**
 * Backward-compatible name for the authentication gates that previously only
 * understood landing pages. New code should use the more precise helpers.
 */
export function isLandingRoute(pathname: string | null | undefined): boolean {
  return isPublicAccessRoute(pathname);
}
