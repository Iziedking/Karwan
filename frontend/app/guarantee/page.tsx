'use client';
import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { Punc, Accent } from '@/shared/components/Bands';
import { ProfileFrame, Row, RowGroup } from '@/features/profile/ui/ProfileUi';
import { Hint } from '@/shared/components/Hint';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { GuaranteeCard } from '@/features/guarantee/GuaranteeCard';
import { PageTour } from '@/shared/guide/PageTour';
import { STAKE_TOUR_ID, STAKE_STEPS } from '@/shared/guide/tours';
import { ReservesWidget } from '@/features/reputation/components/ReservesWidget';
import { UsycReservesWidget } from '@/features/reputation/components/UsycReservesWidget';
import { YieldClaimPanel } from '@/features/reputation/components/YieldClaimPanel';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const EASE = [0.16, 1, 0.3, 1] as const;

export default function GuaranteePage() {
  const g = useTranslations().dealGuarantee;
  return (
    <AuthGuard
      gateTag={g.signedOut.tag}
      gateTitle={
        <>
          {g.signedOut.titlePrefix} <Accent>{g.signedOut.titleAccent}</Accent>
          <Punc>.</Punc>
        </>
      }
      gateBody={<>{g.signedOut.body}</>}
      gateButtonLabel={g.signedOut.buttonLabel}
    >
      <GuaranteePageInner />
    </AuthGuard>
  );
}

/// The deal guarantee as a money page (view 44, P13): the amount guaranteed
/// first, Deposit and Withdraw, what it does, and the earnings folded under
/// one row. No score here; the record lives on Profile.
function GuaranteePageInner() {
  const pb = useTranslations().pageBits;
  const g = useTranslations().dealGuarantee;
  const mp = useTranslations().moneyPage;
  const reduce = useHydratedReducedMotion();
  const [earningsOpen, setEarningsOpen] = useState(false);

  return (
    <ProfileFrame title={g.title} hint={g.hint}>
      <PageTour id={STAKE_TOUR_ID} steps={STAKE_STEPS} />

      <section id="guarantee" className="scroll-mt-24" data-guide="guarantee">
        <GuaranteeCard />
      </section>

      <section data-guide="stake-your-yield">
        <RowGroup>
          <Row label={mp.earnings} onClick={() => setEarningsOpen((open) => !open)} />
        </RowGroup>
        <AnimatePresence initial={false}>
          {earningsOpen ? (
            <m.div
              id="guarantee-earnings"
              role="region"
              aria-label={mp.earnings}
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="grid gap-4 pt-4" data-guide="stake-network-yield">
                <h2 className="flex items-center gap-1.5 px-1 text-[14px] font-semibold text-[var(--lp-text-sub)]">
                  {pb.stake.yourYield}
                  <Hint side="bottom">{pb.stake.networkYieldHint}</Hint>
                </h2>
                <div className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
                  <YieldClaimPanel />
                </div>
                <UsycReservesWidget />
                <ReservesWidget />
              </div>
            </m.div>
          ) : null}
        </AnimatePresence>
      </section>
    </ProfileFrame>
  );
}
