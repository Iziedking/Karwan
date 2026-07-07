'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { StakeCard } from '@/features/reputation/components/StakeCard';
import { ReservesWidget } from '@/features/reputation/components/ReservesWidget';
import { UsycReservesWidget } from '@/features/reputation/components/UsycReservesWidget';
import { YieldClaimPanel } from '@/features/reputation/components/YieldClaimPanel';
import { useAuth } from '@/shared/hooks/useAuth';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { TIER_HUE } from '@/features/reputation/tierColors';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
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
  const { address } = useAuth();
  const { data } = useReputation(address);
  const sp = useTranslations().stakePage;

  const tier = (data?.tier ?? 'NEW') as Tier;
  const score = Math.round(data?.score ?? 0);
  const idx = ORDER.indexOf(tier);
  const nextTier = idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  const toNext = nextTier ? Math.max(0, BREAKS[idx + 1] - score) : 0;

  return (
    <FullBleed>
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[60ch] fade-up">
          <SectionTag tone="dark" dot="live">
            {sp.hero.tag}
          </SectionTag>
          <HeroHeadline size="lg">
            {sp.hero.line1Prefix} <Accent>{sp.hero.line1Accent}</Accent>
            <Punc>.</Punc>{' '}
            <br className="hidden md:block" />
            {sp.hero.line2Prefix} <Accent>{sp.hero.line2Accent}</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-7 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[50ch]">
            {sp.hero.body}
          </p>
        </div>

        {/* POSITION READOUT: count-up score + tier. The tier column has a
            hard 200px minimum and fits to content, so long tier strings
            like ESTABLISHED render in full without ever truncating. The
            other two columns share the remaining width. */}
        <div className="fade-up mt-9 max-w-[760px] grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(200px,max-content)_minmax(0,1fr)] gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <Stat label={sp.position.reputation}>
            <span className="tabular-nums">
              <CountUp value={score} />
            </span>
            <span className="text-white/35 text-[15px]"> / 1000</span>
          </Stat>
          <Stat label={sp.position.tier}>
            <span style={{ color: TIER_HUE[tier] }}>{tier}</span>
          </Stat>
          <Stat
            label={
              nextTier
                ? sp.position.toNextTemplate.replace('{tier}', nextTier)
                : sp.position.status
            }
            wide
          >
            {nextTier ? (
              <span className="tabular-nums">
                <CountUp value={toNext} />{' '}
                <span className="text-white/45 text-[15px]">{sp.position.pts}</span>
              </span>
            ) : (
              <span style={{ color: TIER_HUE[tier] }}>{sp.position.topTier}</span>
            )}
          </Stat>
        </div>
      </Band>

      {/* NETWORK YIELD: protocol-wide accrual, three tiles + live chart. */}
      <Band tone="light" compact>
        <SectionTag>NETWORK YIELD</SectionTag>
        <HeroHeadline size="md">
          Tokenized T-bills<Punc>.</Punc> Verified yield<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[60ch]">
          Idle stake earns real yield through Hashnote USYC, tokenized US
          Treasuries. Settled on Arc, provable on chain.
        </p>
        <div className="mt-9">
          <UsycReservesWidget />
        </div>
        <div className="mt-5">
          <ReservesWidget />
        </div>
      </Band>

      {/* PER-ACCOUNT YIELD: the connected wallet's slice + Claim CTA. */}
      <Band tone="light" compact>
        <SectionTag>YOUR YIELD</SectionTag>
        <HeroHeadline size="md">
          Earned by you<Punc>.</Punc> Claimable by you<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[60ch]">
          Your share of the protocol&apos;s yield. Claim to your wallet anytime,
          non-custodial.
        </p>
        <div className="mt-9">
          <YieldClaimPanel />
        </div>
      </Band>

      {/* STAKE INTERFACE: the same KarwanVault card used on /profile. */}
      <Band tone="light" compact>
        <SectionTag>{sp.vault.tag}</SectionTag>
        <HeroHeadline size="md">
          {sp.vault.heading}
          <Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-10">
          <StakeCard />
        </div>
      </Band>

      {/* TIER LADDER: what stake unlocks in the agent loop. */}
      <Band tone="light" compact>
        <SectionTag>{sp.ladder.tag}</SectionTag>
        <HeroHeadline size="md">
          {sp.ladder.headingPrefix} <Accent>{sp.ladder.headingAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          {sp.ladder.body}
        </p>
        <ul className="mt-9 space-y-2.5">
          {ORDER.map((t, i) => {
            const here = t === tier;
            return (
              <Reveal key={t} delay={i * 0.05}>
                <li
                  className="relative overflow-hidden flex items-start gap-4 px-5 py-4 ps-6"
                  style={{
                    background: here ? 'rgba(175, 201, 91,0.08)' : 'var(--lp-card)',
                    border: here ? '1px solid var(--lp-accent)' : '1px solid var(--lp-border-light)',
                    borderTopLeftRadius: 14,
                    borderTopRightRadius: 14,
                    borderBottomLeftRadius: 14,
                    borderBottomRightRadius: 4,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute start-0 top-0 bottom-0 w-[3px]"
                    style={{ background: TIER_HUE[t] }}
                  />
                  <span
                    aria-hidden
                    className="mt-1 inline-block w-2.5 h-2.5 shrink-0"
                    style={{ background: TIER_HUE[t], borderRadius: 2 }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="font-sans text-[16px] font-extrabold uppercase tracking-[-0.01em] text-[var(--lp-dark)]">
                        {t}
                        {here && (
                          <span
                            className="ms-2 mono text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 align-middle"
                            style={{
                              background: 'rgba(175, 201, 91,0.18)',
                              color: 'var(--lp-band-dark)',
                              borderRadius: 3,
                            }}
                          >
                            {sp.ladder.youBadge}
                          </span>
                        )}
                      </p>
                      <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums">
                        {BREAKS[i]}
                        {i < ORDER.length - 1 ? ` – ${BREAKS[i + 1] - 1}` : '+'}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-[var(--lp-text-sub)] max-w-[60ch]">
                      {sp.ladder.unlock[t]}
                    </p>
                  </div>
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
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  /// True for long-word values (eg "ESTABLISHED") that need to scale down on
  /// narrow tiles. Uses a fluid font-size so the value never gets clipped.
  fit?: boolean;
}) {
  const sizeClass = fit
    ? 'text-[clamp(14px,4.8vw,24px)]'
    : 'text-[26px]';
  return (
    <div className={`min-w-0 bg-[var(--lp-band-dark)] px-5 py-4 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p
        className={`mt-1.5 font-sans ${sizeClass} font-extrabold tracking-[-0.02em] leading-none text-white truncate`}
      >
        {children}
      </p>
    </div>
  );
}
