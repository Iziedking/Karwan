'use client';
import { useEffect, useState } from 'react';

/// Should the floating launchers get out of the way right now?
///
/// The assistant and the guide sit fixed above the bottom nav, which is fine
/// over a paragraph and not fine over a control. On the deals feed they landed
/// squarely on the pager, so the previous-page arrow was behind the chat bubble
/// and simply could not be tapped. A launcher that eats a control is worse than
/// one that is briefly absent.
///
/// Rather than hard-code a list of routes, anything that must not be covered
/// marks itself with `data-floating-avoid`. This hook watches those elements and
/// reports whether one is currently inside the band the launchers occupy. They
/// fold away while it is, and come back once it has scrolled clear.
///
/// Desktop is excluded: the launchers sit in the margin beside a max-w-6xl
/// column there, so they overlap nothing and hiding them would only cost
/// people the button.

/// Height of the band the launchers occupy, measured up from the bottom of the
/// viewport. Covers the bottom nav, the launcher row above it, and the gaps.
const BAND_PX = 168;
/// Below this width the launchers sit over the content column. At or above it
/// they are in the margin. Matches the `md:` breakpoint the launchers already
/// use to reposition themselves.
const MOBILE_MAX = 768;

export function useFloatingClearance(): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    let alive = true;

    const measure = () => {
      frame = 0;
      if (!alive) return;

      if (window.innerWidth >= MOBILE_MAX) {
        setBlocked(false);
        return;
      }

      const bandTop = window.innerHeight - BAND_PX;
      // getBoundingClientRect rather than IntersectionObserver: the question is
      // whether an element overlaps a band of the VIEWPORT, and the observer
      // answers a question about a scroll container instead. Cheap enough at
      // one rAF per scroll event with a handful of marked elements.
      const hit = Array.from(
        document.querySelectorAll<HTMLElement>('[data-floating-avoid]'),
      ).some((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false; // display:none
        return r.bottom > bandTop && r.top < window.innerHeight;
      });

      setBlocked(hit);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    // Rows arrive after their fetch resolves, so the first measure can run
    // against a page that has not rendered its pager yet.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      alive = false;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, []);

  return blocked;
}

/// The fold-away transition, shared so both launchers move as one thing.
///
/// Translate and scale rather than `display`, so it animates, and it keeps its
/// layout box. `pointer-events: none` while folded is the part that matters:
/// a button at opacity 0 still swallows the tap that was meant for the control
/// underneath it, which is the bug wearing a different hat.
export function floatingClearanceStyle(blocked: boolean): React.CSSProperties {
  return {
    transform: blocked ? 'translateY(140%) scale(0.85)' : 'translateY(0) scale(1)',
    opacity: blocked ? 0 : 1,
    pointerEvents: blocked ? 'none' : undefined,
    transition:
      'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out',
  };
}
