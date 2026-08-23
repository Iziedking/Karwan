'use client';
import { useEffect } from 'react';

/// Marks the document while the page is being scrolled, so the floating
/// launchers can get out of the reader's way.
///
/// The two of them sit just above the bottom nav, which on a phone is over the
/// content column: the last row in frame ends up behind a lime circle. That is
/// the cost of a floating button, and it is only worth paying while someone
/// might press it. While they are scrolling they are reading, not reaching.
///
/// One passive listener for the whole app, and it toggles a class twice per
/// gesture rather than doing anything per frame: the landing's scroll cost was
/// hard enough to pay down without adding to it here.
const IDLE_MS = 420;

export function useScrollQuiet(): void {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const onScroll = () => {
      if (!root.classList.contains('is-scrolling')) root.classList.add('is-scrolling');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.remove('is-scrolling'), IDLE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      root.classList.remove('is-scrolling');
    };
  }, []);
}
