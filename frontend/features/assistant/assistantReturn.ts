import { safeNext } from '@/shared/auth/safeNext';
import { dealRouteBlocked, dealsAvailableOn, isPublicEditorialRoute } from '@/shared/utils/routes';

/// Assistant mode returns once to the exact task it was opened from.
export const RETURN_KEY = 'karwan:assistant-return';

function remembered(raw: string): boolean {
  const safe = safeNext(raw);
  if (!safe) return false;
  try {
    const path = decodeURIComponent(new URL(safe, 'https://karwan.invalid').pathname);
    return !/^\/assistant(?:\/|$)/.test(path) && !isPublicEditorialRoute(path);
  } catch { return false; }
}

export function rememberReturn(pathname: string): void {
  const path = typeof window !== 'undefined' && pathname === window.location.pathname
    ? window.location.pathname + window.location.search + window.location.hash
    : pathname;
  if (!remembered(path)) return;
  try { sessionStorage.setItem(RETURN_KEY, path); } catch { /* Use Home when storage is blocked. */ }
}

export function takeReturn(dealsAvailable = dealsAvailableOn(process.env.NEXT_PUBLIC_ARC_NETWORK)): string {
  const home = dealsAvailable ? '/app' : '/account';
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path && remembered(path) && !dealRouteBlocked(new URL(path, 'https://karwan.invalid').pathname, dealsAvailable) ? path : home;
  } catch { return home; }
}
