'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTerms } from '@/shared/hooks/useTerms';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { isLandingRoute } from '@/shared/utils/routes';
import {
  subscribeSplash,
  getSplashActive,
  getSplashActiveServer,
} from '@/shared/utils/splashSignal';
import { TermsContent } from './TermsContent';
import { cn } from '@/shared/utils/cn';

/// First-signin Terms gate. Mounts once at the root; visible only when the
/// user is signed in and hasn't accepted the current version. Scroll-to-accept
/// pattern: the accept button stays disabled until the user has scrolled the
/// content most of the way down. That keeps the "did you actually read it?"
/// expectation honest without blocking anyone who genuinely wants to skim.
export function TermsModal() {
  const { isAuthenticated } = useAuth();
  const terms = useTerms();
  const pathname = usePathname();
  const t = useTranslations().terms.modal;
  const [submitting, setSubmitting] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Hold the gate until the brand loader has lifted, so it never pops over the
  // splash on a fresh load. The splash publishes this; on landing/no-splash
  // routes it reads false and the gate shows as soon as it otherwise would.
  const splashActive = useSyncExternalStore(
    subscribeSplash,
    getSplashActive,
    getSplashActiveServer,
  );

  // Re-arm the scroll gate every time the modal opens (after sign-in flip,
  // logout-then-login, version bump, etc).
  useEffect(() => {
    if (!terms.needsAcceptance) return;
    setScrolledToEnd(false);
  }, [terms.needsAcceptance]);

  // The landing routes are decoupled from account state: the Terms gate never
  // shows there, even after a wallet account switch flips the connected user.
  if (isLandingRoute(pathname)) return null;
  if (!isAuthenticated) return null;
  // Splash-first, always: the gate holds until the brand loader has fully lifted
  // so the sequence reads SIWE -> splash -> terms, never terms before the splash.
  if (splashActive) return null;
  if (terms.loading) return null;
  if (!terms.needsAcceptance) return null;
  if (typeof document === 'undefined') return null;

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 48) setScrolledToEnd(true);
  }

  async function accept() {
    setSubmitting(true);
    try {
      await terms.accept();
    } catch {
      // useTerms surfaces the error in its `error` field; the inline message
      // below renders it. Stay open so the user can retry.
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.aria}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'rgba(10, 10, 11, 0.78)' }}
    >
      <div
        className="relative w-full max-w-[560px] max-h-[70vh] bg-[var(--lp-card)] flex flex-col overflow-hidden"
        style={{
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
          boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)',
          color: 'var(--lp-dark)',
        }}
      >
        <div
          className="px-6 py-5 flex items-baseline justify-between gap-4"
          style={{ borderBottom: '1px solid var(--lp-border-light)' }}
        >
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:{t.eyebrow}:]
            </p>
            <h2 className="mt-1.5 font-sans text-[22px] font-extrabold tracking-[-0.02em]">
              {t.title}
            </h2>
          </div>
          <Link
            href="/terms"
            target="_blank"
            className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 shrink-0"
          >
            {t.openInTab}
          </Link>
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-6 py-5"
          style={{ background: 'var(--lp-light)' }}
        >
          <TermsContent />
        </div>

        <div
          className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ borderTop: '1px solid var(--lp-border-light)' }}
        >
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {scrolledToEnd ? t.canAccept : t.scrollPrompt}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {terms.error && (
              <span className="mono text-[11px] text-[#7a1f1a]">{terms.error}</span>
            )}
            <button
              type="button"
              onClick={accept}
              disabled={!scrolledToEnd || submitting}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-bold uppercase tracking-[0.08em]',
                'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              style={{
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              {submitting
                ? t.accepting
                : `${t.accept} ${terms.currentVersion ?? ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
