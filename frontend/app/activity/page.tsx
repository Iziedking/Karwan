'use client';
import { useEffect, useState } from 'react';
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
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[58ch]">
          <div className="fade-up">
            <SectionTag tone="dark" dot="live">
              {t.hero.sectionTag}
            </SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline>
              {t.hero.headlineTop}<Punc>.</Punc>
              <br />
              <Accent>{t.hero.headlineAccent}</Accent>
            </HeroHeadline>
          </div>
          <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
            {t.hero.description}
          </p>
        </div>
      </Band>

      {/* STREAM SECTION */}
      <Band tone="light" compact>
        <SectionTag>{t.stream.sectionTag}</SectionTag>
        <HeroHeadline size="md">
          {t.stream.headlinePrefix}<Accent>{t.stream.headlineAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          {t.stream.description}
        </p>
        <div className="mt-10 fade-up fade-up-1" data-guide="activity-stream">
          <PageCard>
            <div className="p-6 md:p-8">
              <ActivityView explorer={explorer} />
            </div>
          </PageCard>
        </div>
      </Band>
    </FullBleed>
  );
}
