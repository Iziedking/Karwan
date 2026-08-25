'use client';

import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/**
 * A compact closing action for product and focused surfaces. Public editorial
 * pages already expose feedback in SiteFooter; this keeps application routes
 * from ending at a dead edge without importing the full marketing footer.
 */
export function PageFeedbackPrompt() {
  const t = useTranslations().footer.feedbackPrompt;

  return (
    <footer className="border-t border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:py-8">
        <div className="max-w-[58ch]">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{t.eyebrow}:]
          </p>
          <p className="mt-2 text-pretty font-sans text-[18px] font-extrabold tracking-[-0.02em]">
            {t.title}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{t.body}</p>
        </div>
        <Link
          href="/feedback"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--lp-band-dark)] px-5 py-3 font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--lp-accent)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
        >
          {t.cta}
          <span aria-hidden className="ms-2">→</span>
        </Link>
      </div>
    </footer>
  );
}
