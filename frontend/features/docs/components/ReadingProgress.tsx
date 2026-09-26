'use client';

import { useEffect, useRef } from 'react';

/// A thin line under the header that fills as you read the page.
export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const k = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${k})`;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 z-40 h-[2px]" style={{ top: 'var(--lp-nav-h, 68px)' }}>
      <div ref={bar} className="h-full origin-left bg-[var(--lp-dark)] rtl:origin-right" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}
