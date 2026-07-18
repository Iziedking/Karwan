'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useIsFetching } from '@tanstack/react-query';
import { isLandingRoute } from '@/shared/utils/routes';
import { setSplashActive } from '@/shared/utils/splashSignal';

// Layout effect on the client (runs before the browser paints), plain effect on
// the server (where layout effects no-op + warn). Used so the splash arms and
// publishes splashActive BEFORE the navigated route paints — otherwise a
// post-paint effect leaves one frame where splashActive is still false from the
// prior route and the Terms gate paints in that gap.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/// Branded route-transition loader. Shows the Karwan logo (the lime mark in a
/// dark square) on the initial load and on EVERY navigation into a non-landing
/// page — launch app -> /app, onboarding -> /app, page clicks — then hides when
/// the incoming page is actually ready, not on a fixed timer.
///
/// "Ready" = no React Query fetches in flight past a short floor (so it can't
/// hide before the page's queries even start, and won't flicker), capped by a
/// hard max so a slow on-chain read never hangs the splash — at the cap it
/// lifts and the page's own skeleton takes over.
///
/// It fires ONLY on navigation, never tied to auth, so the sign-in flow stays
/// calm (page blurred behind the wallet popup, no reload flash). Landing routes
/// never show it.
const MIN_MS = 600; // floor: let the new page's queries start; avoid a flicker
const MAX_MS = 5000; // cap: never hold longer than this, even on a slow page
const STALL_MS = 12_000;

/// The top-level section a route belongs to (its first path segment): '/admin',
/// '/admin/events', '/admin/deals' are all the 'admin' section. Used to tell a
/// page route (a move BETWEEN sections) from a tab / sub-view switch (a move
/// WITHIN one). The branded splash is for the former only.
function sectionOf(path: string): string {
  return path.split('/').filter(Boolean)[0] ?? '';
}

export function GlobalLoadingSplash() {
  const pathname = usePathname();
  const isFetching = useIsFetching();
  const [active, setActive] = useState(() => !isLandingRoute(pathname));
  const [stalled, setStalled] = useState(false);
  const [mounted, setMounted] = useState(() => !isLandingRoute(pathname));
  const startRef = useRef(0);
  const prevPathRef = useRef<string | null>(null);

  // Publish whether the splash is covering the screen so other root overlays
  // (the Terms gate) can hold until it lifts, instead of popping over the logo.
  // Driven by `mounted`, NOT `active`: `active` flips false at the START of the
  // 340ms fade-out, but the splash stays painted (and at z-9999, above the gate)
  // for the whole fade. Publishing off `active` un-gated the Terms modal mid-fade
  // — it appeared, then the loader faded off over it, reading as "terms first,
  // then loader". `mounted` stays true until the splash is fully gone, so the
  // handoff is clean: loader fully lifts, THEN the gate shows. Runs as a layout
  // effect so the flag flips BEFORE paint on a navigation — a post-paint effect
  // let the Terms gate paint one frame before the splash covered it.
  useIsoLayoutEffect(() => {
    setSplashActive(mounted);
  }, [mounted]);

  // Show on the initial load + every PAGE-ROUTE change (skip landing). A switch
  // within the same section (admin tabs, /deals -> /deals/[id], /profile ->
  // /profile/edit) is a sub-view, not a page route, so the branded splash stays
  // down and the section just swaps its content. Arm the cap and stall timers;
  // the data-settled effect below hides it earlier.
  //
  // Layout effect so arming happens BEFORE the navigated route paints. As a
  // post-paint effect, a navigation into a non-landing route (e.g. sign-in ->
  // /onboarding) left one painted frame where the splash hadn't armed yet and
  // splashActive was still false, so the Terms gate flashed in before the splash
  // covered it — "terms, then splash, then terms". Arming pre-paint closes it.
  useIsoLayoutEffect(() => {
    if (isLandingRoute(pathname)) {
      setActive(false);
      prevPathRef.current = pathname;
      return;
    }
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    // Same-section navigation (and only that; the initial load has prev == null)
    // never re-arms the splash.
    if (prev !== null && sectionOf(prev) === sectionOf(pathname)) {
      return;
    }
    setActive(true);
    setStalled(false);
    setMounted(true);
    startRef.current = Date.now();
    const cap = setTimeout(() => setActive(false), MAX_MS);
    const stall = setTimeout(() => setStalled(true), STALL_MS);
    return () => {
      clearTimeout(cap);
      clearTimeout(stall);
    };
  }, [pathname]);

  // Hide as soon as the incoming page's data has settled (nothing fetching)
  // past the MIN floor. Re-arms automatically if a new fetch starts before the
  // floor, so the splash waits for the page's real queries rather than a guess.
  useEffect(() => {
    if (!active || isFetching > 0) return;
    const wait = Math.max(0, MIN_MS - (Date.now() - startRef.current));
    const id = setTimeout(() => setActive(false), wait);
    return () => clearTimeout(id);
  }, [active, isFetching]);

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
