'use client';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// Scroll-triggered section reveal (SKILL §3 motion rule 2: translateY(24px)->0,
/// opacity 0->1, ~15% in view, once, honor prefers-reduced-motion). Replaces the
/// on-mount `.fade-up` for section-level content so a below-fold reveal plays as
/// the reader arrives, not before (audit: reveals were spent before scroll).
///
/// Flash-safe: the hidden state is armed by JS ONLY for sections that start fully
/// below the fold. Anything already on screen (the hero band) is left untouched,
/// so it never blinks, and the server renders the plain, visible element — no
/// SSR flash of invisible content. A single observer per section disconnects
/// after firing, so it stays cheap on long pages.
export function Reveal({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Only arm sections that begin fully below the fold. A partially-visible
    // section would flash from hidden to shown, so leave it as-is.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.classList.add('reveal-armed');
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('reveal-in');
            obs.disconnect();
            break;
          }
        }
      },
      // Fire as the section's top edge enters, so tall bands don't wait for 15%
      // of their full height to scroll past before animating.
      { rootMargin: '0px 0px -12% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn('reveal-section', className)} style={style}>
      {children}
    </div>
  );
}
