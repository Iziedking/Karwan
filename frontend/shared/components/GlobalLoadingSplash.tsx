'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isLandingRoute } from '@/shared/utils/routes';

/// Branded route-transition loader. Shows the Karwan logo (the lime mark in a
/// dark square) on the initial load and on EVERY navigation into a non-landing
/// page — launch app -> /app, onboarding -> /app, page clicks — held for a beat
/// so it covers the incoming page rendering behind it, then fades to reveal it.
///
/// It fires ONLY on navigation. It is not tied to auth in any way, so the
/// sign-in flow stays calm (page blurred behind the wallet popup, no reload
/// flash). The public landing routes never show it.
///
/// MIN_VISIBLE_MS is the single knob for how long the logo holds.
const MIN_VISIBLE_MS = 2000;
const STALL_MS = 12_000;

export function GlobalLoadingSplash() {
  const pathname = usePathname();
  const [active, setActive] = useState(() => !isLandingRoute(pathname));
  const [stalled, setStalled] = useState(false);
  const [mounted, setMounted] = useState(() => !isLandingRoute(pathname));

  // Initial load + every route change. Landing stays instant.
  useEffect(() => {
    if (isLandingRoute(pathname)) {
      setActive(false);
      return;
    }
    setActive(true);
    setStalled(false);
    setMounted(true);
    const hide = setTimeout(() => setActive(false), MIN_VISIBLE_MS);
    const stall = setTimeout(() => setStalled(true), STALL_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(stall);
    };
  }, [pathname]);

  // Fade out, then drop from the tree.
  useEffect(() => {
    if (active) return;
    const id = setTimeout(() => setMounted(false), 340);
    return () => clearTimeout(id);
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden={!active}
      role="status"
      className="fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 motion-reduce:transition-none"
      style={{
        // Theme-aware page background (cream in light, near-black in dark) so
        // the splash reads as the surface the page will paint into.
        background: 'var(--color-bg, #0a0a0c)',
        opacity: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div className="flex flex-col items-center gap-8 px-6 text-center">
        <span
          className="karwan-splash-mark inline-flex items-center justify-center"
          style={{
            width: 104,
            height: 104,
            borderRadius: 26,
            // The brand logo lockup, identical in both themes: the lime mark in
            // a dark square. A faint border keeps the square defined on the dark
            // theme's near-black background.
            background: 'var(--lp-band-dark, #101214)',
            color: 'var(--lp-accent, #afc95b)',
            border: '1px solid var(--color-line, rgba(255,255,255,0.08))',
            boxShadow: '0 10px 48px -14px rgba(0,0,0,0.30)',
          }}
        >
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M7 17 L10 7 L12 13 L14 7 L17 17"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        {stalled ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-[14px] font-semibold text-[var(--color-ink,#ededed)]">
              Can't reach Karwan.
            </p>
            <p className="text-[12px] text-[var(--color-ink,#ededed)] opacity-60 max-w-[24ch]">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1 mono text-[11px] font-bold uppercase tracking-[0.12em] px-4 py-2 rounded-lg"
              style={{ background: 'var(--lp-accent, #afc95b)', color: '#101214' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="karwan-splash-bar" aria-hidden />
        )}
      </div>
    </div>
  );
}
