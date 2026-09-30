'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { filmState, type SignInFilm } from '../signInMedia';

// One slow loop tells the deal: buyer and seller draw together, the escrow line
// fills, the payment settles and the record writes itself row by row.
// Reduced motion keeps the still composition.
const ART_MOTION = `
.signin-art g, .signin-art circle { transform-box: fill-box; transform-origin: center; }
.signin-art .art-buyer { animation: art-buyer 14s ease-in-out infinite; }
.signin-art .art-seller { animation: art-seller 14s ease-in-out infinite; }
.signin-art .art-escrow { animation: art-escrow 14s ease-in-out infinite; }
.signin-art .art-line { stroke-dasharray: 1; animation: art-line 14s ease-in-out infinite; }
.signin-art .art-coin { animation: art-coin 14s ease-in-out infinite; }
.signin-art .art-row { animation: art-row 14s ease-in-out infinite; }
@keyframes art-buyer { 0%, 100% { transform: translate(0, 0); } 35%, 70% { transform: translate(18px, 14px); } }
@keyframes art-seller { 0%, 100% { transform: translate(0, 0); } 35%, 70% { transform: translate(-18px, 10px); } }
@keyframes art-escrow { 0%, 38%, 100% { transform: scale(1); } 46% { transform: scale(1.02); } 60% { transform: scale(1); } }
@keyframes art-line { 0%, 30% { stroke-dashoffset: 1; } 48%, 86% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -1; } }
@keyframes art-coin { 0%, 45% { transform: translateY(0); } 55% { transform: translateY(-10px); } 68%, 88% { transform: translateY(12px); } 100% { transform: translateY(0); } }
@keyframes art-row { 0%, 100% { opacity: var(--o); } 6% { opacity: 0.9; } 22% { opacity: var(--o); } }
@media (prefers-reduced-motion: reduce) {
  .signin-art * { animation: none !important; }
  .signin-art .art-line { stroke-dashoffset: 0; }
}
`;

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
          className="signin-art absolute inset-0 h-full w-full" fill="var(--palette-paper)">
          <style>{ART_MOTION}</style>
          <g className="art-buyer">
            <rect x="100" y="140" width="185" height="125" rx="20" opacity="0.35" transform="rotate(-8 192 202)" />
          </g>
          <g className="art-seller">
            <rect x="355" y="180" width="185" height="125" rx="20" opacity="0.25" transform="rotate(6 448 242)" />
          </g>
          <g className="art-escrow">
            <rect x="90" y="340" width="290" height="156" rx="78" opacity="0.95" />
            <path className="art-line" d="M92 418H378" pathLength={1} fill="none" stroke="var(--action)" strokeWidth="4" />
          </g>
          <circle className="art-coin" cx="477" cy="492" r="52" opacity="0.85" />
          {[0.2, 0.3, 0.4, 0.5, 0.6].map((opacity, i) => (
            <rect key={i} className="art-row" style={{ animationDelay: `${7 + i * 0.6}s`, '--o': opacity } as CSSProperties}
              x="395" y={585 + i * 30} width="164" height="22" rx="11" opacity={opacity} />
          ))}
        </svg>
      )}
    </div>
  );
}
