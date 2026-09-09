'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/core/api';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ActivityView } from '@/features/activity/components/ActivityView';
import { PageTour } from '@/shared/guide/PageTour';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ACTIVITY_TOUR_ID, ACTIVITY_STEPS } from '@/shared/guide/tours';
import {
  FullBleed,
  Band,
} from '@/shared/components/Bands';

export default function ActivityPage() {
  const t = useTranslations().activity;
  const [explorer, setExplorer] = useState<string>('https://testnet.arcscan.app');

  useEffect(() => {
    api
      .status()
      .then((s) => setExplorer(s.chain.explorer ?? 'https://testnet.arcscan.app'))
      .catch(() => {
        /* keep default */
      });
  }, []);

  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <ActivityPageInner t={t} explorer={explorer} />
    </AuthGuard>
  );
}

function ActivityPageInner({
  t,
  explorer,
}: {
  t: ReturnType<typeof useTranslations>['activity'];
  explorer: string;
}) {
  return (
    <div className="product-surface">
    <FullBleed>
      <PageTour id={ACTIVITY_TOUR_ID} steps={ACTIVITY_STEPS} />
      <Band tone="light" compact>
        <header className="activity-hero mb-5 border-b border-[var(--lp-border-light)] pb-5">
          <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">Your records</p>
          <h1 className="mt-2 text-[clamp(2.8rem,6vw,5.2rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[var(--lp-dark)]">Activity</h1>
        </header>
        <div className="fade-up fade-up-1">
          <ActivityView explorer={explorer} />
        </div>

        {/* The stream above is a live window and only reaches back as far as
            the current contracts. This is the way to the whole history, which
            is a different question and so a different page. */}
        <Link
          href="/activity/all-time"
          data-floating-avoid
          className="fade-up fade-up-2 mt-4 group grid gap-3 border-t border-[var(--lp-border-light)] px-1 py-4 transition-colors hover:border-[var(--lp-ink)] sm:flex sm:items-center sm:justify-between sm:gap-4 md:py-5"
        >
          <span className="min-w-0">
            <span className="block mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {t.allTime.sectionTag}
            </span>
            <span className="mobile-readable mt-1.5 block text-[15px] font-bold text-[var(--lp-ink)]">
              {t.allTime.entryTitle}
            </span>
          </span>
          <span className="inline-flex min-h-11 w-fit shrink-0 items-center mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] transition-colors group-hover:text-[var(--lp-ink)] sm:min-h-0">
            {t.allTime.entryCta} →
          </span>
        </Link>
      </Band>
    </FullBleed>
    </div>
  );
}
