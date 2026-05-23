'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { SignInGate } from '@/shared/components/SignInGate';
import { ActivityView } from '@/features/activity/components/ActivityView';
import { PageTour } from '@/shared/guide/PageTour';
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
  const { isAuthenticated, isLoading } = useAuth();
  const [explorer, setExplorer] = useState<string>('https://testnet.arcscan.app');

  useEffect(() => {
    api
      .status()
      .then((s) => setExplorer(s.chain.explorer ?? 'https://testnet.arcscan.app'))
      .catch(() => {
        /* keep default */
      });
  }, []);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <SignInGate
        variant="page"
        tag="STREAM"
        body="Every deal moving across Karwan, live from Arc. Sign in to view the network stream and search by job ID."
      />
    );
  }

  return (
    <FullBleed>
      <PageTour id={ACTIVITY_TOUR_ID} steps={ACTIVITY_STEPS} />
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[58ch]">
          <div className="fade-up">
            <SectionTag tone="dark" dot="live">
              STREAM
            </SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline>
              Every event<Punc>.</Punc>
              <br />
              <Accent>On chain.</Accent>
            </HeroHeadline>
          </div>
          <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
            Live from Arc Testnet. Each row deep-links to the explorer.
          </p>
        </div>
      </Band>

      {/* STREAM SECTION */}
      <Band tone="light" compact>
        <SectionTag>EVENT STREAM</SectionTag>
        <HeroHeadline size="md">
          Audit the <Accent>chain</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          Full network event log.
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
