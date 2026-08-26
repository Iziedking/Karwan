'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FEEDBACK_NUDGE_DELAY_MS,
  FEEDBACK_NUDGE_LAST_SHOWN_KEY,
  FEEDBACK_NUDGE_SESSION_KEY,
  shouldOfferFeedbackNudge,
} from '@/shared/feedback/feedbackNudge';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/**
 * A quiet, frequency-capped product nudge. Public pages already carry feedback
 * in SiteFooter, while focused and money-sensitive routes should not interrupt
 * the task in front of the user. ChromeFrame therefore mounts this only in the
 * workspace, and this component narrows that further to safe hub routes.
 */
export function PageFeedbackPrompt() {
  const pathname = usePathname();
  const translations = useTranslations();
  const t = translations.footer.feedbackPrompt;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (typeof window === 'undefined') return;

    let sessionShown = false;
    let lastShownAt: number | null = null;
    try {
      sessionShown = window.sessionStorage.getItem(FEEDBACK_NUDGE_SESSION_KEY) === '1';
      const stored = Number(window.localStorage.getItem(FEEDBACK_NUDGE_LAST_SHOWN_KEY));
      lastShownAt = Number.isFinite(stored) && stored > 0 ? stored : null;
    } catch {
      // Privacy modes may disable storage. The page remains usable and the
      // mounted component can still present one dismissible nudge.
    }

    if (!shouldOfferFeedbackNudge({ pathname, sessionShown, lastShownAt, now: Date.now() })) {
      return;
    }

    const timer = window.setTimeout(() => {
      const now = Date.now();
      setVisible(true);
      try {
        window.sessionStorage.setItem(FEEDBACK_NUDGE_SESSION_KEY, '1');
        window.localStorage.setItem(FEEDBACK_NUDGE_LAST_SHOWN_KEY, String(now));
      } catch {
        // The visible close control remains sufficient when storage is blocked.
      }
    }, FEEDBACK_NUDGE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!visible) return null;

  return (
    <aside
      data-floating-avoid
      className="page-feedback-slot fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[390px] text-[var(--lp-dark)] md:bottom-6"
      aria-labelledby="page-feedback-title"
    >
      <div className="page-feedback-nudge relative border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4 shadow-[0_18px_54px_-28px_rgba(0,0,0,0.48)] sm:p-5">
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label={translations.auth.modal.aria.close}
          className="absolute end-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--lp-text-muted)] transition-colors hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
        >
          <span aria-hidden className="text-[16px] leading-none">×</span>
        </button>
        <div className="pe-10">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{t.eyebrow}:]
          </p>
          <p
            id="page-feedback-title"
            className="mt-1.5 text-pretty font-sans text-[16px] font-extrabold leading-snug tracking-[-0.02em]"
          >
            {t.title}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--lp-text-sub)]">{t.body}</p>
        </div>
        <Link
          href="/feedback"
          onClick={() => setVisible(false)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--lp-band-dark)] px-4 py-2.5 font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--lp-accent)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
        >
          {t.cta}
          <span aria-hidden className="ms-2">→</span>
        </Link>
      </div>
    </aside>
  );
}
