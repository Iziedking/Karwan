'use client';
import { useEffect } from 'react';

/// Publishes the live vertical-scrollbar width as the CSS var
/// `--scrollbar-width` on <html>. The full-bleed `.w-bleed` bands subtract it
/// so they fill the viewport content box exactly instead of over-shooting by
/// the scrollbar width (which would force a spurious horizontal scrollbar at
/// normal zoom). Recomputes on resize/zoom. Renders nothing.
export function ScrollbarWidthProbe() {
  useEffect(() => {
    const root = document.documentElement;
    const set = () => {
      const w = Math.max(0, window.innerWidth - root.clientWidth);
      root.style.setProperty('--scrollbar-width', `${w}px`);
    };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);
  return null;
}
