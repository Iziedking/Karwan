'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { Punc, Accent } from '@/shared/components/Bands';
import { ProfileFrame, Row, RowGroup } from '@/features/profile/ui/ProfileUi';
import { Hint } from '@/shared/components/Hint';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { StakeCard } from '@/features/reputation/components/StakeCard';
import { PageTour } from '@/shared/guide/PageTour';
import { STAKE_TOUR_ID, STAKE_STEPS } from '@/shared/guide/tours';
import { ReservesWidget } from '@/features/reputation/components/ReservesWidget';
import { UsycReservesWidget } from '@/features/reputation/components/UsycReservesWidget';
import { YieldClaimPanel } from '@/features/reputation/components/YieldClaimPanel';
import { LegacyStakeNudge } from '@/features/reputation/components/LegacyStakeNudge';
import { useAuth } from '@/shared/hooks/useAuth';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { TIER_HUE, tierInk } from '@/features/reputation/tierColors';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { tierProgress, tierProgressLabel } from '@/features/reputation/tierProgressLabel';

type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';
const ORDER: Tier[] = ['NEW', 'COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];
const BREAKS = [0, 200, 400, 600, 800, 1000];

const EASE = [0.16, 1, 0.3, 1] as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/// Count-up readout. Eases 0 -> value on mount (SKILL motion: numbers tween,
/// never snap). Collapses to the final value under reduced motion.
function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <>
      {n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
}

export default function StakePage() {
  const sp = useTranslations().stakePage;
  return (
    <AuthGuard
      gateTag={sp.signedOut.tag}
      gateTitle={
        <>
          {sp.signedOut.titlePrefix} <Accent>{sp.signedOut.titleAccent}</Accent>
          <Punc>.</Punc>
        </>
      }
      gateBody={<>{sp.signedOut.body}</>}
      gateButtonLabel={sp.signedOut.buttonLabel}
    >
      <StakePageInner />
    </AuthGuard>
  );
}

function StakePageInner() {
  const pb = useTranslations().pageBits;
  const { address } = useAuth();
  const { data } = useReputation(address);
  const sp = useTranslations().stakePage;
  const tp = useTranslations().tierProgress;
  const reduce = useHydratedReducedMotion();
  const [reserveOpen, setReserveOpen] = useState(false);

  const rawTier = data?.tier;
  const tier: Tier = rawTier && ORDER.includes(rawTier as Tier)
    ? (rawTier as Tier)
    : 'NEW';
  const score = Math.round(data?.score ?? 0);
  const progress = tierProgress({
    score,
    tier,
    tierCappedBy: data?.tierCappedBy ?? null,
    dealsToNextTier: data?.dealsToNextTier ?? null,
  });
  const progressLabel = tierProgressLabel(progress, tp, (t) => t);
  const nextTier = progress.kind === 'top' || progress.kind === 'unknown' ? null : progress.nextTier;
  const capped = data?.tierCappedBy != null;

  const nextValue =
    progress.kind === 'deals'
      ? `${progress.deals} ${progress.deals === 1 ? sp.position.dealOne : sp.position.dealMany}`
      : progress.kind === 'points'
        ? `${progress.points} ${sp.position.pts}`
        : progress.kind === 'concentration'
          ? progressLabel
          : progress.kind === 'top'
            ? sp.position.topTier
            : undefined;

  return (
    <ProfileFrame title={sp.hero.tag} hint={sp.hero.body}>
      <PageTour id={STAKE_TOUR_ID} steps={STAKE_STEPS} />

      <RowGroup>
        <Row label={sp.position.reputation} value={<><CountUp value={score} /> / 1000</>} />
        <Row
          label={sp.position.tier}
          value={
            <span style={{ color: tierInk(tier) }}>
              {tier}
              {capped ? ` · ${data?.tierCappedBy === 'concentration' ? sp.position.cappedConcentration : sp.position.cappedDeals}` : ''}
            </span>
          }
        />
        {nextValue ? <Row label={nextTier ? sp.position.toNextTemplate.replace('{tier}', nextTier) : sp.position.status} value={nextValue} /> : null}
      </RowGroup>

      <section id="vault" className="scroll-mt-24 space-y-2" data-guide="stake-vault">
        <h2 className="px-1 text-[14px] font-semibold text-[var(--lp-text-sub)]">{sp.vault.tag}</h2>
        <StakeCard />
        <LegacyStakeNudge />
      </section>

      <section className="space-y-2" data-guide="stake-your-yield">
        <h2 className="flex items-center gap-1.5 px-1 text-[14px] font-semibold text-[var(--lp-text-sub)]">
          {pb.stake.yourYield}
          <Hint side="bottom">{pb.stake.networkYieldHint}</Hint>
        </h2>
        <div className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <YieldClaimPanel />
        </div>
      </section>

      <section data-guide="stake-network-yield">
        <RowGroup>
          <Row label={pb.stake.networkYield} onClick={() => setReserveOpen((open) => !open)} />
        </RowGroup>
        <AnimatePresence initial={false}>
          {reserveOpen ? (
            <motion.div
              id="stake-reserve-details"
              role="region"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="grid gap-4 pt-4">
                <UsycReservesWidget />
                <ReservesWidget />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <RowGroup title={sp.ladder.tag}>
        {ORDER.map((name, i) => (
          <Row
            key={name}
            label={
              <span className="block">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: TIER_HUE[name] }} />
                  {name}
                  {name === tier ? <span className="rounded-full bg-[var(--tint)] px-2 text-[14px] font-semibold">{sp.ladder.youBadge}</span> : null}
                </span>
                <span className="block text-[14px] font-normal text-[var(--lp-text-sub)]">{sp.ladder.unlock[name]}</span>
              </span>
            }
            value={`${BREAKS[i]}${i < ORDER.length - 1 ? `–${BREAKS[i + 1] - 1}` : '+'}`}
          />
        ))}
      </RowGroup>
    </ProfileFrame>
  );
}

