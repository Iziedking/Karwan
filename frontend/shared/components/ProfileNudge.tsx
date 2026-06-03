'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const DISMISS_PREFIX = 'karwan:profile-nudge-dismissed:';

/// A slim, dismissible banner shown to connected wallets with no profile yet.
/// Profiles stay optional; this just points out the upside. Self-gates on
/// route, connection, profile state, and a per-wallet dismissal flag.
export function ProfileNudge() {
  const pathname = usePathname();
  const auth = useAuth();
  const t = useTranslations().profileNudge;
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const { profile, fetchState } = useUserProfile();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!address) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(
        window.localStorage.getItem(`${DISMISS_PREFIX}${address.toLowerCase()}`) === '1',
      );
    } catch {
      setDismissed(false);
    }
  }, [address]);

  const isApp = pathname !== '/' && pathname !== '/how-it-works';
  const onProfileSetupRoute =
    pathname.startsWith('/onboarding') || pathname.startsWith('/profile');
  const noProfile = fetchState === 'success' && !profile;

  if (!mounted || !isApp || onProfileSetupRoute || !isConnected || !noProfile || dismissed) {
    return null;
  }

  function dismiss() {
    setDismissed(true);
    if (!address) return;
    try {
      window.localStorage.setItem(`${DISMISS_PREFIX}${address.toLowerCase()}`, '1');
    } catch {
      /* quota, ignore */
    }
  }

  return (
    <div className="border-b border-[var(--color-line)] bg-[var(--color-surface-2)]">
      <div className="mx-auto max-w-6xl px-6 py-2.5 flex items-center gap-3">
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
          style={{
            background: 'var(--color-ink)',
            color: 'var(--color-surface)',
          }}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3 13c0-2.3 2.2-3.6 5-3.6s5 1.3 5 3.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <p className="text-[12.5px] text-[var(--color-ink-dim)] flex-1 leading-snug">
          <span className="text-[var(--color-ink)] font-medium">{t.titleFragment}</span> {t.bodyFragment}
        </p>
        <Link
          href="/onboarding"
          style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-surface)' }}
          className="text-[12px] font-semibold rounded-md px-3 py-1.5 hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 shrink-0"
        >
          {t.cta}
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.dismissAria}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] transition-colors shrink-0"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
