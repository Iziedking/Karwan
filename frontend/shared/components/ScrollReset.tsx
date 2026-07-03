'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/// Every route change starts at the top of the page. The browser's default
/// scroll restoration was dropping fresh navigations at the previous page's
/// scroll position, so pages "loaded at the footer" and the user had to scroll
/// up. We take manual control of scroll restoration and reset to the top on each
/// path change, unless the URL points at an in-page anchor (so #action deep
/// links still land on their section). Mounted once in the root layout.
export function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);
  return null;
}
