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

/**
 * Return the nearest useful parent for product-level navigation. This keeps
 * detail and settings views recoverable without guessing browser history,
 * which may point outside Karwan after a shared link is opened.
 */
export function getProductBackHref(
  pathname: string | null | undefined,
  isAuthenticated = true,
): string | null {
  if (!pathname || pathname === '/app') return null;
  if (matchesRoute(pathname, '/settings')) return '/profile';
  if (pathname === '/profile') return '/app';
  if (matchesRoute(pathname, '/profile/business/setup')) return '/profile/business';
  if (matchesRoute(pathname, '/business/verification')) return '/profile/business';
  if (matchesRoute(pathname, '/profile')) return '/profile';
  if (matchesRoute(pathname, '/activity/all-time')) return '/activity';
  if (matchesRoute(pathname, '/listings')) return '/market';
  if (matchesRoute(pathname, '/partners')) return '/market';
  if (matchesRoute(pathname, '/market')) return isAuthenticated ? '/app' : '/';
  if (matchesRoute(pathname, '/onboarding')) return '/';
  if (matchesRoute(pathname, '/cashout')) return isAuthenticated ? '/app' : '/';

  const appParents = [
    '/account',
    '/activity',
    '/bridge',
    '/business',
    '/b2b',
    '/buyer',
    '/deals',
    '/financier',
    '/jobs',
    '/legacy',
    '/p2p',
    '/seller',
    '/stake',
    '/supply',
  ];
  if (appParents.some((route) => matchesRoute(pathname, route))) return '/app';
  return null;
}

/** Routes that may be read without starting the account authentication flow. */
export function isPublicAccessRoute(pathname: string | null | undefined): boolean {
  return isPublicEditorialRoute(pathname) || isPublicDiscoveryRoute(pathname);
}

/** Task flows that keep identity controls but remove navigation distractions. */
export function isFocusedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return matchesRoute(pathname, '/onboarding') || matchesRoute(pathname, '/cashout') || matchesRoute(pathname, '/profile/business/setup');
}

/**
 * Focused for everyone, signed in or not.
 *
 * Onboarding qualifies because wandering off mid-setup is the exact thing the
 * focus is protecting against. Cashout does not: it is focused for a stranger
 * following a shared link, who has no app to navigate, and merely stripped for
 * a signed-in person cashing out their own deal. They are inside the product
 * with their navigation taken away and no reason given.
 */
function isFocusedForEveryone(pathname: string | null | undefined): boolean {
  return !!pathname && (matchesRoute(pathname, '/onboarding') || matchesRoute(pathname, '/profile/business/setup'));
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
  if (isFocusedRoute(pathname) && (isFocusedForEveryone(pathname) || !isAuthenticated)) {
    return 'focused';
  }
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
