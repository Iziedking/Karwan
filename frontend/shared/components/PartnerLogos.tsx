import type { ReactNode } from 'react';

export function PartnerLogos() {
  // 12s cycle: each logo fades + drops in with a small stagger, holds, fades back,
  // then the strip loops. Keyframe (peer-drop) lives in globals.css so this can
  // stay a server component.
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 text-[var(--color-ink-dim)]">
      <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)] mr-2">
        Built on
      </span>
      <LogoSlot delay="0s">
        <Circle />
      </LogoSlot>
      <LogoSlot delay="0.25s">
        <Arc />
      </LogoSlot>
      <LogoSlot delay="0.5s">
        <Ignyte />
      </LogoSlot>
      <LogoSlot delay="0.75s">
        <Difc />
      </LogoSlot>
    </div>
  );
}

function LogoSlot({ delay, children }: { delay: string; children: ReactNode }) {
  return (
    <span className="peer-drop inline-flex" style={{ animationDelay: delay }}>
      {children}
    </span>
  );
}

function Circle() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7v10M9 10c0-1.5 1-3 3-3M15 14c0 1.5-1 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Circle</span>
    </div>
  );
}

function Arc() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 18 C 8 6, 16 6, 21 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="3" cy="18" r="1.4" fill="currentColor" />
        <circle cx="21" cy="18" r="1.4" fill="currentColor" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Arc</span>
    </div>
  );
}

function Ignyte() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3 C 14 7, 18 8, 17 13 C 16 18, 12 21, 12 21 C 12 21, 8 18, 7 13 C 6 8, 10 7, 12 3 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Ignyte</span>
    </div>
  );
}

function Difc() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 12h10M12 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">DIFC</span>
    </div>
  );
}
