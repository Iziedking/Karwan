import { WALLET_HOME } from '@/shared/utils/routes';
import { navHref, type NavItemId } from './workspaceNav';

export type RouteMotion = 'none' | 'forward' | 'back' | 'fade';

const NAV_IDS: NavItemId[] = ['home', 'market', 'deals', 'money', 'messages', 'finance', 'activity', 'profile'];
const TAB_ROOTS = new Set(['/app', WALLET_HOME, ...NAV_IDS.map((id) => navHref(id, '/app'))]);

/// How a new page arrives: the first page of a visit paints still, the
/// browser's back reverses, a tab fades, and anything opened from a page
/// pushes in from the end side.
export function routeMotion(previous: string | null, next: string, popped: boolean): RouteMotion {
  if (previous === null || previous === next) return 'none';
  if (popped) return 'back';
  if (TAB_ROOTS.has(next)) return 'fade';
  return 'forward';
}
