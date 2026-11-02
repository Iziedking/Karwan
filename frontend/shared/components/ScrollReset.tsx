'use client';
import { useEffect, useRef } from 'react';
import { installSessionRestoreGuard } from '@/shared/auth/sessionRestore';
import { consumeHistoryTraversal } from '@/shared/utils/navigationHistory';
import { usePathname } from 'next/navigation';

/// Every route change starts at the top of the page. The browser's default
/// scroll restoration was dropping fresh navigations at the previous page's
/// scroll position, so pages "loaded at the footer" and the user had to scroll
/// up. Fresh pathname changes start at the top; Back, Forward and reload use
/// the browser’s restoration. We reset on each
/// path change, unless the URL points at an in-page anchor (so #action deep
/// links still land on their section). Mounted once in the root layout.
export function ScrollReset() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => installSessionRestoreGuard(window), []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto';
    }
    const initial = first.current;
    first.current = false;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (consumeHistoryTraversal(window) || (initial && (navigation?.type === 'reload' || navigation?.type === 'back_forward'))) return;
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);
  return null;
}
