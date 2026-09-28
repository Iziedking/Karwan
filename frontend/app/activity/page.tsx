'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { settlementChain } from '@/core/arcNetwork';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ActivityView } from '@/features/activity/components/ActivityView';
import { PageTour } from '@/shared/guide/PageTour';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ACTIVITY_TOUR_ID, ACTIVITY_STEPS } from '@/shared/guide/tours';
import {
  FullBleed,
  Band,
} from '@/shared/components/Bands';

const ARC_EXPLORER = settlementChain.blockExplorers?.default.url ?? '';

export default function ActivityPage() {
  const t = useTranslations().activity;
  const [explorer, setExplorer] = useState<string>(ARC_EXPLORER);

  useEffect(() => {
    api
      .status()
      .then((s) => setExplorer(s.chain.explorer ?? ARC_EXPLORER))
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
      </Band>
    </FullBleed>
    </div>
  );
}
