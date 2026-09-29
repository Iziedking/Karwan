'use client';

import { useEffect, useRef } from 'react';
import { filmState, type SignInFilm } from '../signInMedia';

export function SignInMedia({ film = null }: { film?: SignInFilm | null }) {
  const panel = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    const frame = panel.current;
    if (!film || !element || !frame) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let intersects = false;
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      const state = filmState({ film: true, reducedMotion: motion.matches, visible: intersects && !document.hidden });
      if (state === 'play') {
        void element.play().then(() => {
          // A play request can settle after the panel or document was hidden.
          if (disposed || motion.matches || !intersects || document.hidden) element.pause();
        }).catch(() => undefined);
      } else {
        element.pause();
        if (state === 'poster') element.load();
      }
    };
    element.load();
    const observer = new IntersectionObserver(([entry]) => {
      intersects = !!entry?.isIntersecting && entry.intersectionRatio >= 0.25;
      sync();
    }, { threshold: 0.25 });
    observer.observe(frame);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      disposed = true;
      observer.disconnect();
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      element.pause();
    };
  }, [film]);

  return (
    <div ref={panel} data-testid="signin-media" aria-hidden="true"
      className="relative hidden min-h-[560px] overflow-hidden rounded-[28px] bg-[var(--palette-night-surface)] lg:block">
      {film ? (
        <video ref={video} muted playsInline loop preload="none" poster={film.poster}
          className="absolute inset-0 h-full w-full object-cover">
          <source src={film.webm} type="video/webm" />
          <source src={film.mp4} type="video/mp4" />
        </video>
      ) : (
        <svg viewBox="0 0 640 780" aria-hidden="true" focusable="false"
          className="absolute inset-0 h-full w-full" fill="var(--palette-paper)">
          <rect x="100" y="140" width="185" height="125" rx="20" opacity="0.35" transform="rotate(-8 192 202)" />
          <rect x="355" y="180" width="185" height="125" rx="20" opacity="0.25" transform="rotate(6 448 242)" />
          <rect x="90" y="340" width="290" height="156" rx="78" opacity="0.95" />
          <path d="M92 418H378" fill="none" stroke="var(--action)" strokeWidth="4" vectorEffect="non-scaling-stroke" />
          <circle cx="477" cy="492" r="52" opacity="0.85" />
          <rect x="395" y="585" width="164" height="22" rx="11" opacity="0.2" />
          <rect x="395" y="615" width="164" height="22" rx="11" opacity="0.3" />
          <rect x="395" y="645" width="164" height="22" rx="11" opacity="0.4" />
          <rect x="395" y="675" width="164" height="22" rx="11" opacity="0.5" />
          <rect x="395" y="705" width="164" height="22" rx="11" opacity="0.6" />
        </svg>
      )}
    </div>
  );
}
