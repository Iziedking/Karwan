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
import { Icon } from '@/shared/components/Icon';

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
      <div className="page-feedback-nudge relative flex items-center gap-3 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] py-3 pe-2 ps-4 shadow-[var(--hero-shadow)]">
        <p id="page-feedback-title" className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">
          {t.title}
        </p>
        <Link
          href="/feedback"
          onClick={() => setVisible(false)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--action)] px-4 text-[14px] font-semibold text-[var(--on-action)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
        >
          {t.cta}
        </Link>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label={translations.auth.modal.aria.close}
          className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--tint)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
    </aside>
  );
}
