import { isPublicEditorialRoute } from '../utils/routes';

/// A restored document may hold an old account or confirmation sheet in memory.
/// Reopen it through the current session instead of trusting that snapshot.
export function refreshOnRestore(pathname: string): boolean {
  return !isPublicEditorialRoute(pathname) || /^\/(?:start|waitlist|recover)(?:\/|$)/.test(pathname);
}

export function installSessionRestoreGuard(win: Window): () => void {
  let previousVisibility: string | null = null;
  const hide = () => {
    if (!refreshOnRestore(win.location.pathname)) return;
    previousVisibility = win.document.documentElement.style.visibility;
    win.document.documentElement.style.visibility = 'hidden';
  };
  const show = (event: PageTransitionEvent) => {
    if (event.persisted && refreshOnRestore(win.location.pathname)) {
      win.location.reload();
      return;
    }
    if (previousVisibility !== null) {
      win.document.documentElement.style.visibility = previousVisibility;
      previousVisibility = null;
    }
  };
  win.addEventListener('pagehide',hide);
  win.addEventListener('pageshow',show);
  return () => {
    win.removeEventListener('pagehide',hide);
    win.removeEventListener('pageshow',show);
    if(previousVisibility!==null)win.document.documentElement.style.visibility=previousVisibility;
  };
}
