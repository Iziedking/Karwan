'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useActivation } from '@/shared/hooks/useActivation';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
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

/// First-run orientation for the app home. This is deliberately a short,
/// action-linked list rather than a grid of instructional cards. The setup row
/// disappears as soon as the corresponding real state is reached: activation
/// removes the activation task, and the whole guide gives way to the user's
/// deal book after the first deal exists.
export function QuickStartBand() {
  const t = useTranslations().appHome.quickStart;
  const { activated, loading: activationLoading } = useActivation();
  const { deals, fetchState } = useDirectDeals();
  const reduce = useReducedMotion();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  // Wait for the real deal query before deciding whether this is a first-use
  // account. This prevents the guide flashing over an established book while
  // the cache is still warming.
  if (activationLoading || fetchState === 'loading' || dismissed || deals.length > 0) return null;

  const steps: Step[] = [
    ...(!activated
      ? [{ n: '01', ...t.steps.activate, href: '/profile#agents' }]
      : []),
    {
      n: activated ? '01' : '02',
      ...t.steps.post,
      href: '/p2p',
    },
    {
      n: activated ? '02' : '03',
      title: t.steps.settle.title,
      body: t.steps.settle.body,
    },
  ];

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private window or storage disabled; just hide for this session */
    }
  };

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

      <motion.ol
        layout
        transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="mt-7 border-y border-[var(--lp-border-light)] fade-up fade-up-1"
      >
        <AnimatePresence initial={false}>
          {steps.map((s) => {
            const content = (
              <>
                <span className="mono shrink-0 text-[11px] font-bold tracking-[0.16em] text-[var(--lp-accent-hover)]">
                  {s.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-[15px] font-extrabold tracking-[-0.01em] leading-tight text-[var(--lp-dark)]">
                    {s.title}
                  </span>
                  <span className="mt-1 block max-w-[62ch] text-[13px] leading-snug text-[var(--lp-text-sub)]">
                    {s.body}
                  </span>
                </span>
                {s.cta ? (
                  <span className="shrink-0 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-dark)] transition-transform group-hover:translate-x-1">
                    {s.cta} <span aria-hidden>→</span>
                  </span>
                ) : null}
              </>
            );

            return (
              <motion.li
                key={s.n}
                layout
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: reduce ? 0 : 0.18 }}
                className="border-b last:border-b-0 border-[var(--lp-border-light)]"
              >
                {s.href ? (
                  <Link
                    href={s.href}
                    className="group flex min-h-[76px] items-center gap-4 py-4 transition-colors hover:bg-black/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:gap-6 sm:py-5"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-h-[76px] items-center gap-4 py-4 sm:gap-6 sm:py-5">
                    {content}
                  </div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ol>
    </Band>
  );
}
