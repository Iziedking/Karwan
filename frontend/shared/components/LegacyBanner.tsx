'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { AUTH_CHANGED_EVENT } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Countdown } from './Countdown';

interface WindowState {
  open: boolean;
  closesAtMs: number | null;
}

const DISMISS_KEY = 'karwan.legacy.dismissed';

/// Dismissal is per-login, not permanent. We keep the flag in localStorage so
/// the banner stays hidden while the user pokes around the app, but we clear
/// it on every auth transition. Sign in fresh → banner shows again.
export function LegacyBanner() {
  const t = useTranslations().banners.legacy;
  const [state, setState] = useState<WindowState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .legacyWindow()
      .then((r) => {
        if (!alive) return;
        setState({ open: r.open, closesAtMs: r.closesAtMs });
      })
      .catch(() => {
        if (!alive) return;
        setState({ open: false, closesAtMs: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  // Reset the dismiss on every auth change (sign in or sign out). Without this,
  // a user who cancels the banner once never sees it again — even after a full
  // logout + re-login cycle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => {
      window.localStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
  }, []);

  if (!state?.open || dismissed) return null;

  return (
    <section
      role="status"
      aria-label={t.ariaLabel}
      className="relative left-1/2 w-bleed -translate-x-1/2 overflow-hidden"
      style={{ background: 'var(--lp-band-dark)' }}
    >
      <div
        aria-hidden
        className="sheen-tl absolute inset-0 pointer-events-none opacity-60"
        style={{ ['--sheen-color' as string]: 'color-mix(in oklab, var(--lp-accent) 28%, transparent)' }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative mx-auto max-w-[1440px] px-[clamp(16px,5vw,72px)] py-4 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-8">
        <div className="min-w-0 flex-1 flex items-start sm:items-center gap-3 sm:gap-5 pe-8 sm:pe-0">
          <span
            className="hidden sm:flex shrink-0 items-center justify-center w-12 h-12 mono text-[18px] font-extrabold"
            style={{
              background: 'var(--lp-accent)',
              color: 'var(--lp-band-dark)',
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 4,
            }}
            aria-hidden
          >
            ↻
          </span>
          <div className="min-w-0">
            <span
              className="inline-block mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 mb-1.5 sm:mb-2 whitespace-nowrap"
              style={{
                background: 'var(--lp-accent)',
                color: 'var(--lp-band-dark)',
                borderRadius: 3,
              }}
            >
              [:{t.eyebrowPrefix}{' '}
              {state.closesAtMs ? (
                <Countdown targetMs={state.closesAtMs} />
              ) : (
                t.closesSoonFallback
              )}
              :]
            </span>
            <p className="font-sans text-[15px] sm:text-[19px] font-extrabold tracking-[-0.01em] leading-tight text-white">
              {t.title}
            </p>
            <p className="hidden sm:block mt-1.5 text-[13px] leading-snug text-white/65">
              {t.body}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <Link
            href="/legacy"
            className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 mono text-[11px] sm:text-[13px] font-bold uppercase tracking-[0.1em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] sm:hover:-translate-y-0.5 active:translate-y-0 transition-[transform,box-shadow] duration-150 shadow-[0_4px_0_rgba(0,0,0,0.35)] hover:shadow-[0_5px_0_rgba(0,0,0,0.35)] active:shadow-[0_1px_0_rgba(0,0,0,0.35)]"
            style={{
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 3,
            }}
          >
            {t.openRecovery}
            <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem('karwan.legacy.dismissed', '1');
              setDismissed(true);
            }}
            aria-label={t.dismissAria}
            title={t.dismissTooltip}
            className="absolute sm:static top-2 end-2 mono text-[14px] sm:text-[12px] text-white/50 sm:text-white/40 hover:text-white/80 px-2 py-1 transition-colors"
          >
            ×
          </button>
        </div>
      </div>
    </section>
  );
}
