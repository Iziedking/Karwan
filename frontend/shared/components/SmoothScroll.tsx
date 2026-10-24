'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { smoothScrollAllowed } from '@/shared/utils/smoothScroll';

/// A mouse wheel or trackpad glides the page to a stop instead of jumping
/// (owner, 24 Oct 2026). Desktop pointers only: phones keep their own native
/// scrolling, people who ask for less motion get none, and a page with its own
/// panel scrolling keeps it. Anything that scrolls on its own (a chat
/// thread, a list, a sheet) scrolls natively inside it.
export function SmoothScroll() {
  const pathname = usePathname();
  useEffect(() => {
    if (!smoothScrollAllowed(pathname, window)) return;
    let stop = () => {};
    let cancelled = false;
    void import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({
        autoRaf: true,
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        allowNestedScroll: true,
        anchors: true,
        // Lenis walks the event path, which ends at the document and window:
        // only elements answer `closest`.
        prevent: (node: HTMLElement) =>
          typeof node?.closest === 'function' && !!node.closest('[role="dialog"], [data-lenis-prevent], [data-own-scroll]'),
      });
      stop = () => lenis.destroy();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [pathname]);
  return null;
}
