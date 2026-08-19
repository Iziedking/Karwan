'use client';
import { useEffect } from 'react';

/// Publishes the live vertical-scrollbar width as the CSS var
/// `--scrollbar-width` on <html>. The full-bleed `.w-bleed` bands subtract it
/// so they fill the viewport content box exactly instead of over-shooting by
/// the scrollbar width (which would force a spurious horizontal scrollbar at
/// normal zoom). Recomputes when content, the viewport, or zoom changes.
export function ScrollbarWidthProbe() {
  useEffect(() => {
    const root = document.documentElement;
    const set = () => {
      const w = Math.max(0, window.innerWidth - root.clientWidth);
      root.style.setProperty('--scrollbar-width', `${w}px`);
    };

    set();
    const frame = window.requestAnimationFrame(set);
    const observer = new ResizeObserver(set);
    observer.observe(document.body);
    window.addEventListener('resize', set);
    window.visualViewport?.addEventListener('resize', set);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', set);
      window.visualViewport?.removeEventListener('resize', set);
    };
  }, []);
  return null;
}
