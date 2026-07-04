'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { isLandingRoute } from '@/shared/utils/routes';

/// Branded loader for entering the app. It covers the incoming page with the
/// Karwan logo for a beat, then fades to reveal it. It fires on:
///   - every route change into a non-landing page (launch app -> /app,
///     onboarding -> /app, page clicks), and
///   - the auth flip to signed-in (the non-auth -> authed /app swap, which is an
///     in-place content swap, not a route change).
/// It is deliberately NOT tied to the auth LOADING state, so the sign-in flow
/// itself stays smooth; the auth trigger only fires the moment sign-in
/// completes. The public landing routes never show it.
///
/// MIN_VISIBLE_MS is the single knob for how long the logo holds. Bump it (e.g.
/// to 5000) for a longer hold; drop it for a snappier feel.
const MIN_VISIBLE_MS = 2000;
const STALL_MS = 12_000;

export function GlobalLoadingSplash() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const [active, setActive] = useState(() => !isLandingRoute(pathname));
  const [stalled, setStalled] = useState(false);
  const [mounted, setMounted] = useState(() => !isLandingRoute(pathname));
  const [nonce, setNonce] = useState(0);

  const show = useCallback(() => {
    if (isLandingRoute(pathname)) return;
    setActive(true);
    setStalled(false);
    setMounted(true);
    setNonce((n) => n + 1);
  }, [pathname]);

  // Route-change trigger: the initial load and every navigation. Landing stays
  // instant (no splash).
  useEffect(() => {
    if (isLandingRoute(pathname)) {
      setActive(false);
      return;
    }
    show();
  }, [pathname, show]);

  // Auth-flip trigger: cover the in-place non-auth -> authed swap (signing in
  // while already on /app is a content swap, not a route change). NOT tied to
  // isLoading, so the sign-in flow stays smooth; it fires only when auth
  // resolves to signed-in. Skips the initial bootstrap resolve so a normal
  // reload doesn't double up with the route trigger.
  const resolvedOnce = useRef(false);
  const prevAuth = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (!resolvedOnce.current) {
      resolvedOnce.current = true;
      prevAuth.current = isAuthenticated;
      return;
    }
    if (isAuthenticated && !prevAuth.current) show();
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated, isLoading, show]);

  // Auto-hide after the branded minimum whenever a trigger bumps the nonce.
  useEffect(() => {
    if (nonce === 0 && !active) return;
    const hide = setTimeout(() => setActive(false), MIN_VISIBLE_MS);
    const stall = setTimeout(() => setStalled(true), STALL_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(stall);
    };
  }, [nonce]);

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
