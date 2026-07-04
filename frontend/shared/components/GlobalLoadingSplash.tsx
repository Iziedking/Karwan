'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isLandingRoute } from '@/shared/utils/routes';

/// Branded route-transition loader. Shows the Karwan logo on the initial load
/// and on EVERY route change (launch app, nav clicks), held for a minimum
/// branded duration so it covers the incoming page rendering behind it, then
/// fades to reveal the page. Deliberately NOT gated on auth — it fires for
/// every navigation, not just sign-in.
///
/// MIN_VISIBLE_MS is the single knob for how long the logo stays. Bump it (e.g.
/// to 5000) for a longer, more dramatic hold; drop it for a snappier feel.
const MIN_VISIBLE_MS = 2000;
const STALL_MS = 12_000;

export function GlobalLoadingSplash() {
  const pathname = usePathname();
  // Start visible on an app route (covers the initial load / launch-app), start
  // hidden on the public landing so the marketing home never flashes it.
  const [active, setActive] = useState(() => !isLandingRoute(pathname));
  const [stalled, setStalled] = useState(false);
  const [mounted, setMounted] = useState(() => !isLandingRoute(pathname));

  // Fire on the first mount AND on every pathname change. Skip the public
  // landing routes so the marketing home still paints instantly.
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

  // Keep the overlay mounted through its fade-out, then drop it from the tree.
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
        // Match the page background of whichever theme is active (cream in
        // light, near-black in dark) so the splash reads as the same surface
        // the page will paint into.
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
            // Theme-adaptive, high-contrast in both: the badge is the ink color
            // (dark square in light theme, light square in dark theme) and the
            // mark is the page background (the inverse), so it always reads.
            background: 'var(--color-ink, #0c0e10)',
            color: 'var(--color-bg, #fafaf7)',
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
