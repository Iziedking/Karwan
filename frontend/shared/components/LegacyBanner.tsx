'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';

interface WindowState {
  open: boolean;
  daysRemaining: number | null;
}

/// Single entry point to the legacy recovery surface. Renders only while
/// LEGACY_WINDOW_CLOSES_AT is in the future and a legacy contract is
/// configured on the backend. Polls /api/legacy/window once per page load.
export function LegacyBanner() {
  const [state, setState] = useState<WindowState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .legacyWindow()
      .then((r) => {
        if (!alive) return;
        setState({ open: r.open, daysRemaining: r.daysRemaining });
      })
      .catch(() => {
        if (!alive) return;
        setState({ open: false, daysRemaining: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem('karwan.legacy.dismissed') === '1');
  }, []);

  if (!state?.open || dismissed) return null;

  const daysCopy =
    state.daysRemaining == null
      ? 'CLOSES SOON'
      : state.daysRemaining <= 0
        ? 'CLOSES TODAY'
        : `CLOSES IN ${state.daysRemaining}D`;

  return (
    <div
      role="status"
      aria-label="Legacy contract recovery window"
      className="relative px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3"
      style={{
        background:
          'linear-gradient(120deg, color-mix(in oklab, var(--lp-accent) 18%, transparent), color-mix(in oklab, var(--lp-accent) 5%, transparent))',
        borderBottom: '1px solid color-mix(in oklab, var(--lp-accent) 35%, transparent)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="mono text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5"
          style={{
            background: 'var(--lp-band-dark)',
            color: 'var(--lp-accent)',
            borderRadius: 3,
          }}
        >
          [:LEGACY · {daysCopy}:]
        </span>
        <p className="text-[13px] leading-snug text-[var(--lp-dark)] min-w-0">
          Reclaim stake or pending deals from the previous contracts.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/legacy"
          className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] bg-[var(--lp-band-dark)] text-[var(--lp-accent)] hover:bg-[var(--lp-band-dark-hover,#101418)] transition-colors"
          style={{
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          Open recovery
        </Link>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem('karwan.legacy.dismissed', '1');
            setDismissed(true);
          }}
          aria-label="Dismiss banner"
          title="Dismiss for this browser. The banner stays gone until the recovery window closes."
          className="mono text-[10px] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] px-2 py-1 transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
}
