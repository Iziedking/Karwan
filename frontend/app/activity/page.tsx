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
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  PageCard,
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
    <FullBleed>
      <PageTour id={ACTIVITY_TOUR_ID} steps={ACTIVITY_STEPS} />
      {/* HERO */}
      {/* Keep the activity title close to the stream it labels. The compact
          band should size to its content instead of reserving a second block
          of editorial whitespace above the first record. */}
      <Band
        tone="dark"
        overlay={<GridOverlay />}
        compact
        className="min-h-[88px] !pt-2 !pb-3 sm:min-h-[112px] sm:!pt-4 sm:!pb-4"
      >
        <div className="max-w-[58ch]">
          <div className="fade-up">
            <SectionTag tone="dark" dot="live">
              {t.hero.sectionTag}
            </SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline size="md">
              {t.hero.headlineTop}
              <br />
              <Accent>{t.hero.headlineAccent}</Accent><Punc>.</Punc>
            </HeroHeadline>
          </div>
        </div>
      </Band>

      {/* STREAM SECTION. The hero already frames this, and ActivityView carries
          its own [:event stream:] eyebrow + counts, so no restated header here. */}
      <Band tone="light" compact className="!pt-0 md:!pt-0">
        <div className="fade-up fade-up-1">
          <PageCard>
            <div className="p-6 md:p-8">
              <ActivityView explorer={explorer} />
            </div>
          </PageCard>
        </div>

        {/* The stream above is a live window and only reaches back as far as
            the current contracts. This is the way to the whole history, which
            is a different question and so a different page. */}
        <Link
          href="/activity/all-time"
          data-floating-avoid
          className="fade-up fade-up-2 mt-4 group grid gap-3 rounded-xl border border-[var(--lp-border-light)] p-4 transition-colors hover:border-[var(--lp-ink)] sm:flex sm:items-center sm:justify-between sm:gap-4 md:p-6"
        >
          <span className="min-w-0">
            <span className="block mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:{t.allTime.sectionTag}:]
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
  );
}
