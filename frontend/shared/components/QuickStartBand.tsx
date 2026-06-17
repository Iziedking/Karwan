'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useActivation } from '@/shared/hooks/useActivation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Band, SectionTag, HeroHeadline, Punc } from './Bands';

const DISMISS_KEY = 'karwan.quickstart.dismissed';

interface Step {
  n: string;
  title: string;
  body: string;
  cta?: string;
  href?: string;
}

/// First-run orientation for the app home. A brand-new user (agents not yet
/// activated) lands on a busy desk and, per the public review, did not know what
/// to do next. This lays out the three steps to a first deal with direct links.
/// It hides once the user activates their agents, or when they dismiss it.
export function QuickStartBand() {
  const t = useTranslations().appHome.quickStart;
  const { activated, loading } = useActivation();
  // Start hidden so the band never flashes before we have read storage or the
  // activation state.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (loading || activated || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private window or storage disabled; just hide for this session */
    }
  };

  const steps: Step[] = [
    { n: '01', ...t.steps.activate, href: '/profile#identity' },
    { n: '02', ...t.steps.post, href: '/p2p' },
    { n: '03', title: t.steps.settle.title, body: t.steps.settle.body },
  ];

  return (
    <Band tone="light" compact>
      <div className="flex items-start justify-between gap-4 fade-up">
        <div>
          <SectionTag>{t.eyebrow}</SectionTag>
          <HeroHeadline size="md">
            {t.title}
            <Punc>.</Punc>
          </HeroHeadline>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.dismissAria}
          className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] hover:bg-black/[0.05] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-8 grid sm:grid-cols-3 gap-4 fade-up fade-up-1">
        {steps.map((s) => (
          <div
            key={s.n}
            className="relative overflow-hidden p-5 bg-[var(--lp-card)] border border-[var(--lp-border-light)] flex flex-col"
            style={{
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 4,
            }}
          >
            <span className="mono text-[11px] font-bold tracking-[0.16em] text-[var(--lp-accent)]">
              {s.n}
            </span>
            <p className="mt-3 font-sans text-[16px] font-extrabold tracking-[-0.01em] leading-tight text-[var(--lp-dark)]">
              {s.title}
            </p>
            <p className="mt-2 text-[13px] leading-snug text-[var(--lp-text-sub)] flex-1">
              {s.body}
            </p>
            {s.href && s.cta ? (
              <Link
                href={s.href}
                className="mt-4 inline-flex items-center mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-dark)] hover:text-[var(--lp-accent-hover)] transition-colors"
              >
                {s.cta}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </Band>
  );
}
