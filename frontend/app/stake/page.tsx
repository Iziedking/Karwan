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
import { SignInGate } from '@/shared/components/SignInGate';
import { StakeCard } from '@/features/reputation/components/StakeCard';
import { useAuth } from '@/shared/hooks/useAuth';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { TIER_HUE } from '@/features/reputation/tierColors';

type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';
const ORDER: Tier[] = ['NEW', 'COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];
const BREAKS = [0, 200, 400, 600, 800, 1000];
// Tier hue + unlock copy. The hue palette is shared (tierColors) so the ladder,
// the reputation badge on bids/negotiation, and deal/profile all read the same.
const TIER_UNLOCK: Record<Tier, string> = {
  NEW: 'New here. Agents add a small premium until you build a record.',
  COLD: 'Early track record. Agents ease the premium.',
  ESTABLISHED: 'Trusted profile. Standard terms across the desk.',
  STRONG: 'Preferred counterparty. Agents move faster, tighter spreads.',
  ELITE: 'Top tier. Agents accept first look within range, no auction.',
};

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
  const { isAuthenticated, address } = useAuth();
  const { data } = useReputation(address);

  if (!isAuthenticated) {
    return (
      <SignInGate
        tag="STAKE"
        title={
          <>
            Earn <Accent>reputation</Accent>
            <Punc>.</Punc>
          </>
        }
        body={
          <>
            Deposit USDC into KarwanVault. The longer it sits, the more reputation it earns. On
            mainnet the same stake earns yield through Hashnote USYC.
          </>
        }
        buttonLabel="Log in to stake"
      />
    );
  }

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
            STAKE
          </SectionTag>
          <HeroHeadline size="lg">
            Earn <Accent>reputation</Accent>
            <Punc>.</Punc>{' '}
            <br className="hidden md:block" />
            Earn <Accent>yield</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-7 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[50ch]">
            Stake USDC. The longer it sits, the more reputation it earns. Withdraw any time. 7-day
            cool-down on the way out.
          </p>
          <p className="mt-5 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-relaxed">
            // ON MAINNET THIS STAKE ROUTES THROUGH HASHNOTE USYC FOR ~5% APY
          </p>

          {/* POSITION READOUT — count-up score + tier. */}
          <div className="mt-9 grid grid-cols-2 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <Stat label="Reputation">
              <span className="tabular-nums">
                <CountUp value={score} />
              </span>
              <span className="text-white/35 text-[15px]"> / 1000</span>
            </Stat>
            <Stat label="Tier">
              <span style={{ color: TIER_HUE[tier] }}>{tier}</span>
            </Stat>
            <Stat label={nextTier ? `To ${nextTier}` : 'Status'} wide>
              {nextTier ? (
                <span className="tabular-nums">
                  <CountUp value={toNext} /> <span className="text-white/45 text-[15px]">pts</span>
                </span>
              ) : (
                <span style={{ color: TIER_HUE[tier] }}>Top tier</span>
              )}
            </Stat>
          </div>
        </div>
      </Band>

      {/* STAKE INTERFACE — the same KarwanVault card used on /profile. */}
      <Band tone="light" compact>
        <SectionTag>YOUR STAKE</SectionTag>
        <HeroHeadline size="md">
          Vault<Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-10">
          <StakeCard />
        </div>
      </Band>

      {/* TIER LADDER — what stake unlocks in the agent loop. */}
      <Band tone="light" compact>
        <SectionTag>TIER LADDER</SectionTag>
        <HeroHeadline size="md">
          What stake <Accent>unlocks</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          Reputation moves your tier. Tier changes how the agents negotiate for you.
        </p>
        <ul className="mt-9 space-y-2.5">
          {ORDER.map((t, i) => {
            const here = t === tier;
            return (
              <Reveal key={t} delay={i * 0.05}>
                <li
                  className="relative overflow-hidden flex items-start gap-4 px-5 py-4 pl-6"
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
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
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
                            className="ml-2 mono text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 align-middle"
                            style={{
                              background: 'rgba(175, 201, 91,0.18)',
                              color: 'var(--lp-band-dark)',
                              borderRadius: 3,
                            }}
                          >
                            You
                          </span>
                        )}
                      </p>
                      <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums">
                        {BREAKS[i]}
                        {i < ORDER.length - 1 ? ` – ${BREAKS[i + 1] - 1}` : '+'}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-[var(--lp-text-sub)] max-w-[60ch]">
                      {TIER_UNLOCK[t]}
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
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`bg-[var(--lp-band-dark)] px-5 py-4 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-1.5 font-sans text-[26px] font-extrabold tracking-[-0.02em] leading-none text-white">
        {children}
      </p>
    </div>
  );
}
