'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { StakeCard } from '@/features/reputation/components/StakeCard';
import { AgentStakeBinding } from '@/features/reputation/components/AgentStakeBinding';
import { PageTour } from '@/shared/guide/PageTour';
import { STAKE_TOUR_ID, STAKE_STEPS } from '@/shared/guide/tours';
import { ReservesWidget } from '@/features/reputation/components/ReservesWidget';
import { UsycReservesWidget } from '@/features/reputation/components/UsycReservesWidget';
import { YieldClaimPanel } from '@/features/reputation/components/YieldClaimPanel';
import { LegacyStakeNudge } from '@/features/reputation/components/LegacyStakeNudge';
import { useAuth } from '@/shared/hooks/useAuth';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { TIER_HUE } from '@/features/reputation/tierColors';
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
  const [n, setN] = useState(() => (prefersReducedMotion() ? value : 0));
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

/// Section reveal on scroll: translateY -> 0 + fade, once, 20% in view.
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
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
  const reduce = useReducedMotion();
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

  return (
    <FullBleed>
      <PageTour id={STAKE_TOUR_ID} steps={STAKE_STEPS} />

      <Band tone="dark" overlay={<GridOverlay />} compact>
        <div className="max-w-[68ch] fade-up">
          <div className="flex items-center gap-2">
            <SectionTag tone="dark" dot="live">{sp.hero.tag}</SectionTag>
            <Hint glow side="bottom" align="start">{sp.hero.body}</Hint>
          </div>
          <HeroHeadline size="md">
            {sp.hero.line1Prefix} <Accent>{sp.hero.line1Accent}</Accent>
            <Punc>.</Punc>{' '}
            {sp.hero.line2Prefix} <Accent>{sp.hero.line2Accent}</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
        </div>

        <div className="fade-up mt-8 grid max-w-[760px] grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-soft)] sm:grid-cols-[minmax(0,1fr)_minmax(200px,max-content)_minmax(0,1fr)]">
          <Stat label={sp.position.reputation}>
            <span className="tabular-nums"><CountUp value={score} /></span>
            <span className="text-[15px] text-[var(--lp-workspace-faint)]"> / 1000</span>
          </Stat>
          <Stat label={sp.position.tier} fit>
            <span style={{ color: TIER_HUE[tier] }}>{tier}</span>
            {capped ? (
              <span className="mt-1 block mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--lp-workspace-faint)]">
                {data?.tierCappedBy === 'concentration'
                  ? sp.position.cappedConcentration
                  : sp.position.cappedDeals}
              </span>
            ) : null}
          </Stat>
          <Stat
            label={nextTier ? sp.position.toNextTemplate.replace('{tier}', nextTier) : sp.position.status}
            wide
            wrap
          >
            {progress.kind === 'deals' ? (
              <span className="tabular-nums">
                <CountUp value={progress.deals} />{' '}
                <span className="text-[15px] text-[var(--lp-workspace-faint)]">
                  {progress.deals === 1 ? sp.position.dealOne : sp.position.dealMany}
                </span>
              </span>
            ) : progress.kind === 'points' ? (
              <span className="tabular-nums">
                <CountUp value={progress.points} />{' '}
                <span className="text-[15px] text-[var(--lp-workspace-faint)]">{sp.position.pts}</span>
              </span>
            ) : progress.kind === 'concentration' ? (
              <span className="text-[15px] text-[var(--lp-workspace-muted)]">{progressLabel}</span>
            ) : progress.kind === 'top' ? (
              <span style={{ color: TIER_HUE[tier] }}>{sp.position.topTier}</span>
            ) : null}
          </Stat>
        </div>
      </Band>

      <Band tone="light" compact id="vault" className="scroll-mt-24" dataGuide="stake-vault">
        <div className="grid items-start gap-8 [grid-template-areas:'stake-heading'_'stake-body'_'yield-heading'_'yield-body'] lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] lg:gap-x-10 lg:gap-y-8 lg:[grid-template-areas:'stake-heading_yield-heading'_'stake-body_yield-body']">
          <header className="min-w-0 [grid-area:stake-heading]">
            <SectionTag>{sp.vault.tag}</SectionTag>
            <HeroHeadline size="md">{sp.vault.heading}<Punc>.</Punc></HeroHeadline>
          </header>

          <div className="min-w-0 [grid-area:stake-body]">
            <AgentStakeBinding />
            <StakeCard />
            <LegacyStakeNudge />
          </div>

          <header className="min-w-0 [grid-area:yield-heading]">
            <div className="flex items-center gap-2">
              <SectionTag>{pb.stake.yourYield}</SectionTag>
              <Hint glow side="bottom" align="start">
                Your share of the protocol&apos;s yield. Claim to your wallet anytime, non-custodial.
              </Hint>
            </div>
            <h2 className="mt-4 max-w-[16ch] font-sans text-[clamp(1.7rem,3vw,2.6rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-[var(--lp-dark)]">
              {pb.stake.earnedByYou}<Punc>.</Punc> {pb.stake.claimableByYou}<Punc>.</Punc>
            </h2>
          </header>

          <aside
            className="min-w-0 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 [grid-area:yield-body] sm:p-6"
            data-guide="stake-your-yield"
          >
            <YieldClaimPanel />
          </aside>
        </div>
      </Band>

      <Band tone="light" compact dataGuide="stake-network-yield">
        <button
          type="button"
          aria-expanded={reserveOpen}
          aria-controls="stake-reserve-details"
          onClick={() => setReserveOpen((open) => !open)}
          className="group grid min-h-11 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-4 border-y border-[var(--lp-border-light)] py-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-inset"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <SectionTag>{pb.stake.networkYield}</SectionTag>
              <Hint glow side="bottom" align="start">
                Idle stake earns real yield through Hashnote USYC, tokenized US Treasuries. Settled on Arc, provable on chain.
              </Hint>
            </span>
            <span className="mt-3 block font-sans text-[clamp(1.45rem,3vw,2.4rem)] font-extrabold uppercase leading-[0.98] tracking-[-0.03em] text-[var(--lp-dark)]">
              {pb.stake.tokenizedTbills}<Punc>.</Punc> {pb.stake.verifiedYield}<Punc>.</Punc>
            </span>
          </span>
          <span
            aria-hidden
            className={`grid size-11 place-items-center rounded-full border border-[var(--lp-border-light)] text-[22px] text-[var(--lp-text-sub)] transition-transform duration-300 motion-reduce:transition-none ${reserveOpen ? 'rotate-180' : ''}`}
          >
            ↓
          </span>
        </button>

        <AnimatePresence initial={false}>
          {reserveOpen ? (
            <motion.div
              id="stake-reserve-details"
              role="region"
              initial={reduce ? false : { height: 0, opacity: 0, y: -8 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0, y: -8 }}
              transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="grid gap-5 pt-6 lg:grid-cols-2">
                <UsycReservesWidget />
                <ReservesWidget />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Band>

      <Band tone="light" compact>
        <div className="flex items-center gap-2">
          <SectionTag>{sp.ladder.tag}</SectionTag>
          <Hint glow side="bottom" align="start">{sp.ladder.body}</Hint>
        </div>
        <HeroHeadline size="md">
          {sp.ladder.headingPrefix} <Accent>{sp.ladder.headingAccent}</Accent><Punc>.</Punc>
        </HeroHeadline>

        <ul className="mt-8 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {ORDER.map((t, i) => {
            const here = t === tier;
            return (
              <Reveal key={t} delay={i * 0.04}>
                <li
                  className="relative h-full min-h-[150px] overflow-hidden rounded-[14px_14px_4px_14px] border p-5"
                  style={{
                    background: here ? 'rgba(175,201,91,0.08)' : 'var(--lp-card)',
                    borderColor: here ? 'var(--lp-accent)' : 'var(--lp-border-light)',
                  }}
                >
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: TIER_HUE[t] }} />
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-sans text-[17px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
                      {t}
                    </p>
                    <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums">
                      {BREAKS[i]}{i < ORDER.length - 1 ? `–${BREAKS[i + 1] - 1}` : '+'}
                    </span>
                  </div>
                  {here ? (
                    <span className="mt-3 inline-flex rounded-full bg-[rgba(175,201,91,0.18)] px-2 py-1 mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--lp-dark)]">
                      {sp.ladder.youBadge}
                    </span>
                  ) : null}
                  <p className="mt-4 text-[13px] leading-snug text-[var(--lp-text-sub)]">{sp.ladder.unlock[t]}</p>
                </li>
              </Reveal>
            );
          })}
        </ul>
      </Band>
    </FullBleed>
  );
}

function Stat({
  label,
  children,
  wide,
  fit,
  wrap,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  /// True for long-word values (eg "ESTABLISHED") that need to scale down on
  /// narrow tiles. Uses a fluid font-size so the value never gets clipped.
  fit?: boolean;
  /// True for sentence-length status values. These remain fully readable
  /// instead of inheriting the single-line treatment used by numbers.
  wrap?: boolean;
}) {
  const sizeClass = fit
    ? 'text-[clamp(14px,4.8vw,24px)]'
    : wrap
      ? 'text-[clamp(14px,2vw,20px)]'
      : 'text-[26px]';
  const flowClass = fit || wrap
    ? 'whitespace-normal break-words'
    : 'truncate';
  const leadingClass = wrap ? 'leading-snug' : 'leading-none';
  return (
    <div className={`min-w-0 bg-[var(--lp-workspace-raised)] px-5 py-4 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-workspace-faint)]">{label}</p>
      <p
        className={`mt-1.5 min-w-0 font-sans ${sizeClass} font-extrabold tracking-[-0.02em] ${leadingClass} text-[var(--lp-workspace-ink)] ${flowClass}`}
      >
        {children}
      </p>
    </div>
  );
}
