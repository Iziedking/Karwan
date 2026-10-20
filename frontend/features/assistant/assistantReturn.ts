import { isPublicEditorialRoute } from '@/shared/utils/routes';

/// Where "Assistant on" was switched on from, so switching it off goes back
/// there. Per tab; storage that throws or is empty means Home.

export const RETURN_KEY = 'karwan:assistant-return';
const HOME = '/app';

const remembered = (pathname: string) => !!pathname && !pathname.startsWith('/assistant') && !isPublicEditorialRoute(pathname);

export function rememberReturn(pathname: string): void {
  if (!remembered(pathname)) return;
  try {
    sessionStorage.setItem(RETURN_KEY, pathname);
  } catch {
    /* blocked storage: switching off goes Home */
  }
}

export function takeReturn(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path && remembered(path) ? path : HOME;
  } catch {
    return HOME;
  }
}
