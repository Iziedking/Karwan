'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { isLandingRoute } from '@/shared/utils/routes';

/// Full-screen brand loader that covers nav, footer, and content during the
/// initial auth/render window, so the page never flashes a rendered footer or a
/// stack of skeletons before it's ready (the Cloudflare-interstitial pattern).
/// Gated on auth resolving; skipped on the public landing routes, which render
/// instantly with no auth. If the network stalls past STALL_MS it stops spinning
/// and offers a retry instead of hanging forever. Fades out when ready.
const STALL_MS = 12_000;

export function GlobalLoadingSplash() {
  const { isLoading } = useAuth();
  const pathname = usePathname();
  const [stalled, setStalled] = useState(false);
  const [mounted, setMounted] = useState(true);

  // Never cover the public landing (no auth there; it must paint instantly).
  const active = isLoading && !isLandingRoute(pathname);

  // Network-stall fallback: if loading drags on, surface a retry.
  useEffect(() => {
    if (!active) {
      setStalled(false);
      return;
    }
    const id = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(id);
  }, [active]);

  // Keep the overlay mounted briefly after it goes inactive so it can fade out
  // cleanly rather than vanishing.
  useEffect(() => {
    if (active) {
      setMounted(true);
      return;
    }
    const id = setTimeout(() => setMounted(false), 340);
    return () => clearTimeout(id);
  }, [active]);

  if (!mounted && !active) return null;

  return (
    <div
      aria-hidden={!active}
      role="status"
      className="fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 motion-reduce:transition-none"
      style={{
        background: 'var(--color-surface, #0c0e10)',
        opacity: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div className="flex flex-col items-center gap-7 px-6 text-center">
        <span
          className="karwan-splash-mark inline-flex items-center justify-center"
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'var(--lp-band-dark, #101214)',
            color: 'var(--lp-accent, #afc95b)',
            boxShadow: '0 8px 40px -12px rgba(0,0,0,0.45)',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
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
