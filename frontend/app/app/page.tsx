'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { cn } from '@/shared/utils/cn';
import { api, type ApiStatus } from '@/core/api';
import { DealsFeed } from '@/features/deals/components/DealsFeed';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { shortAddress } from '@/shared/utils/format';

interface NetStats {
  deals: number;
  settled: number;
  usdc: number;
}

export default function AppHome() {
  const router = useRouter();
  const { profile, isConnected, loading, fetchState } = useUserProfile();
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [stats, setStats] = useState<NetStats | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    api
      .dealsFeed()
      .then((r) => {
        const settled = r.deals.filter((d) => d.onChain?.state === 2).length;
        const usdc = r.deals.reduce((s, d) => s + (Number(d.dealAmountUsdc) || 0), 0);
        setStats({ deals: r.deals.length, settled, usdc });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isConnected && fetchState === 'success' && !profile) {
      router.replace('/onboarding');
    }
  }, [isConnected, fetchState, profile, router]);

  if (!status) {
    return (
      <FullBleed>
        <Band tone="light">
          <SectionTag>BACKEND</SectionTag>
          <HeroHeadline>
            Backend offline<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-md">
            Couldn&apos;t reach the API at{' '}
            <span className="mono text-[var(--lp-dark)]">{api.baseUrl}</span>. This page picks up
            the moment it&apos;s back.
          </p>
        </Band>
      </FullBleed>
    );
  }

  if (!isConnected) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">SIGN IN</SectionTag>
          <HeroHeadline>
            Connect to enter<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-md">
            Karwan identifies you by wallet. Connect to access your buyer and seller desks.
          </p>
          <div className="mt-7">
            <ConnectButton />
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (loading || !profile) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">SETTLEMENT DESK</SectionTag>
          <div className="mt-7 space-y-4">
            <div className="h-14 w-3/4 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
            <div className="h-4 w-1/2 rounded-md bg-white/[0.04] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  return (
    <FullBleed>
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot="live">
                SETTLEMENT DESK
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline>
                Welcome back,
                <br />
                {profile.displayName}
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
              Your buyer agent runs the auction. You approve the final terms. Direct deals when
              the counterparty is already named.
            </p>
            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/buyer">Post a brief ↗</CTAPill>
              <CTAPill href="/activity" variant="secondary" tone="dark">
                View activity →
              </CTAPill>
              <span className="ml-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 mono text-[11px] uppercase tracking-[0.08em] text-white/65">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
                {shortAddress(profile.address)}
              </span>
            </div>
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <HeroAgentCard
              dealsRunning={stats?.deals ?? null}
              settled={stats?.settled ?? null}
              usdcThrough={stats?.usdc ?? null}
            />
          </div>
        </div>
      </Band>

      {/* THREE DOORS */}
      <Band tone="light">
        <SectionTag>THREE DOORS</SectionTag>
        <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
          One spine<Punc>.</Punc>
          <br />
          Three doors.
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          Same escrow rails, same reputation, three ways in. Pick the door that matches what
          you&apos;re doing right now.
        </p>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          <div className="fade-up fade-up-1">
            <FeatureCard
              href="/buyer"
              tone="cream"
              eyebrow="BUYER"
              title="Post a brief"
              body="Your agent posts on chain and runs the negotiation."
              vignette={<BriefVignette />}
            />
          </div>
          <div className="fade-up fade-up-2">
            <FeatureCard
              href="/seller"
              tone="dark"
              eyebrow="SELLER"
              title="Watch the bids"
              body="Your seller agent bids on briefs that match your skills."
              vignette={<BidVignette />}
            />
          </div>
          <div className="fade-up fade-up-3">
            <FeatureCard
              href="/activity"
              tone="accent"
              eyebrow="ACTIVITY"
              title="Audit every event"
              body="Every on-chain event, newest first. Deep-links to the explorer."
              vignette={<StreamVignette />}
            />
          </div>
        </div>
      </Band>

      {/* LIVE NETWORK */}
      <Band tone="dark">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[42ch]">
            <SectionTag tone="dark" dot="live">
              LIVE NETWORK
            </SectionTag>
            <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
              Settled in
              <br />
              real <Accent>time</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
          </div>
          <Link
            href="/activity"
            className="group inline-flex items-center gap-1.5 mono text-[12px] uppercase tracking-[0.08em] text-white/70 hover:text-white transition-colors"
          >
            Full feed
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="fade-up fade-up-1">
            <BigStatTile
              label="Direct deals"
              value={<AnimatedNumber value={stats?.deals ?? 0} decimals={0} />}
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-2">
            <BigStatTile
              label="Settled in full"
              value={<AnimatedNumber value={stats?.settled ?? 0} decimals={0} />}
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-3">
            <BigStatTile
              label="USDC through escrow"
              value={<AnimatedNumber value={stats?.usdc ?? 0} decimals={2} />}
              unit="USDC"
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-4">
            <BigStatTile label="Chain" value="5042002" hint="Arc Testnet" />
          </div>
        </div>
      </Band>

      {/* DEALS ACROSS KARWAN */}
      <Band tone="light">
        <SectionTag>DEALS</SectionTag>
        <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
          What&apos;s <Accent>live</Accent> right now<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          Every direct deal on the network, with its live escrow state.
        </p>
        <div className="mt-10 -mx-[clamp(20px,5vw,72px)] -mb-[clamp(64px,9vw,140px)] lg:-mb-0">
          <div
            className="bg-[var(--lp-card)] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_56px_-20px_rgba(0,0,0,0.12)] lg:rounded-tl-[28px] lg:rounded-tr-[28px] lg:rounded-bl-[28px] lg:rounded-br-[6px]"
            style={{
              marginLeft: 'clamp(20px,5vw,72px)',
              marginRight: 'clamp(20px,5vw,72px)',
            }}
          >
            <DealsFeed />
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}

/* ============================================================================
   LANDING-GRADE PRIMITIVES (mirrored locally so /app rhymes with the landing
   page without depending on app/page.tsx's locals)
   ============================================================================ */

function FullBleed({ children }: { children: ReactNode }) {
  return <div className="-mt-10 -mb-10">{children}</div>;
}

function Band({
  tone,
  children,
  overlay,
  className,
}: {
  tone: 'dark' | 'light';
  children: ReactNode;
  overlay?: ReactNode;
  className?: string;
}) {
  const dark = tone === 'dark';
  return (
    <section
      className={cn(
        'relative left-1/2 w-screen -translate-x-1/2 overflow-hidden',
        dark ? 'bg-[var(--lp-dark)] text-white' : 'bg-[var(--lp-light)] text-[var(--lp-dark)]',
        className,
      )}
    >
      {overlay}
      <div className="relative mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-[clamp(64px,9vw,140px)]">
        {children}
      </div>
    </section>
  );
}

function GridOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-50 grid-drift"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
        maskImage: 'radial-gradient(ellipse 90% 80% at 100% 0%, black, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 100% 0%, black, transparent 70%)',
      }}
    />
  );
}

function SectionTag({
  children,
  tone = 'light',
  dot,
}: {
  children: ReactNode;
  tone?: 'dark' | 'light';
  dot?: 'live';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 mono text-[12px] font-medium uppercase tracking-[0.16em]',
        tone === 'dark' ? 'text-white/70' : 'text-[var(--lp-text-sub)]',
      )}
    >
      {dot === 'live' ? (
        <span aria-hidden className="relative flex w-[7px] h-[7px]">
          <span
            className="absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping"
            style={{ background: 'var(--lp-accent)' }}
          />
          <span
            className="relative inline-flex w-[7px] h-[7px] rounded-full"
            style={{ background: 'var(--lp-accent)' }}
          />
        </span>
      ) : (
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
      )}
      [:{children}:]
    </span>
  );
}

function HeroHeadline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        'mt-7 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,6vw,4.75rem)]',
        className,
      )}
    >
      {children}
    </h1>
  );
}

function Punc({ children }: { children: ReactNode }) {
  return <span className="text-[var(--lp-accent)]">{children}</span>;
}

function Accent({ children }: { children: ReactNode }) {
  return <span className="text-[var(--lp-accent)]">{children}</span>;
}

function CTAPill({
  href,
  children,
  variant = 'primary',
  tone = 'dark',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  tone?: 'dark' | 'light';
}) {
  const base =
    'inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em] ' +
    'transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 ' +
    'focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2';
  const corners = {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
  };
  if (variant === 'primary') {
    return (
      <Link
        href={href}
        style={corners}
        className={cn(
          base,
          'bg-[var(--lp-accent)] text-[var(--lp-dark)] shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)]',
          tone === 'dark'
            ? 'focus-visible:ring-offset-[var(--lp-dark)]'
            : 'focus-visible:ring-offset-[var(--lp-light)]',
        )}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      style={corners}
      className={cn(
        base,
        tone === 'dark'
          ? 'border border-white/25 text-white hover:border-white/55 focus-visible:ring-offset-[var(--lp-dark)]'
          : 'border border-black/20 text-[var(--lp-dark)] hover:border-black/45 focus-visible:ring-offset-[var(--lp-light)]',
      )}
    >
      {children}
    </Link>
  );
}

/* ============================================================================
   HERO AGENT CARD — small "control panel" vignette on the right of hero
   ============================================================================ */

function HeroAgentCard({
  dealsRunning,
  settled,
  usdcThrough,
}: {
  dealsRunning: number | null;
  settled: number | null;
  usdcThrough: number | null;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="px-6 pt-6 pb-5 border-b border-white/[0.08]">
        <div className="flex items-center justify-between">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            Agent control
          </span>
          <span
            aria-hidden
            data-instrument-blink
            className="w-[7px] h-[7px]"
            style={{
              background: 'var(--lp-accent)',
              animation: 'instrumentBlink 1.6s ease-in-out infinite',
            }}
          />
        </div>
        <p className="mt-4 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] text-white">
          Buyer agent <span className="text-[var(--lp-accent)]">active</span>
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          Scoring briefs, countering once per round, funding on accept.
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/[0.08]">
        <MiniStat label="Running" value={dealsRunning} />
        <MiniStat label="Settled" value={settled} />
        <MiniStat
          label="Volume"
          value={usdcThrough}
          decimals={2}
          unit="USDC"
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  decimals = 0,
  unit,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  unit?: string;
}) {
  return (
    <div className="px-4 py-4">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-1.5 font-sans text-[20px] font-extrabold tabular-nums tracking-[-0.02em]">
        {value == null ? '—' : <AnimatedNumber value={value} decimals={decimals} />}
      </p>
      {unit && (
        <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">{unit}</p>
      )}
    </div>
  );
}

/* ============================================================================
   FEATURE CARD with internal vignette — the Phantom move
   ============================================================================ */

function FeatureCard({
  href,
  tone,
  eyebrow,
  title,
  body,
  vignette,
}: {
  href: string;
  tone: 'cream' | 'dark' | 'accent';
  eyebrow: string;
  title: string;
  body: string;
  vignette: ReactNode;
}) {
  const surface =
    tone === 'dark'
      ? 'bg-[var(--lp-dark)] text-white'
      : tone === 'accent'
        ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)]'
        : 'bg-[var(--lp-card)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]';
  const eyebrowColor =
    tone === 'dark' ? 'text-white/55' : tone === 'accent' ? 'text-[var(--lp-dark)]/65' : 'text-[var(--lp-text-muted)]';
  const muted =
    tone === 'dark' ? 'text-white/65' : tone === 'accent' ? 'text-[var(--lp-dark)]/75' : 'text-[var(--lp-text-sub)]';
  const vignetteBg =
    tone === 'dark'
      ? 'rgba(255,255,255,0.04)'
      : tone === 'accent'
        ? 'rgba(0,0,0,0.06)'
        : 'var(--lp-light)';
  const vignetteBorder =
    tone === 'dark'
      ? 'rgba(255,255,255,0.08)'
      : tone === 'accent'
        ? 'rgba(0,0,0,0.08)'
        : 'var(--lp-border-light)';

  return (
    <Link
      href={href}
      className={cn(
        'group block relative overflow-hidden transition-[transform,box-shadow] duration-300 ease-out card-shimmer',
        'hover:-translate-y-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.10)]',
        'hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_28px_60px_-22px_rgba(0,0,0,0.20)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
        surface,
      )}
      style={{
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
      }}
    >
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-center justify-between">
          <span className={cn('mono text-[10px] uppercase tracking-[0.2em] font-medium', eyebrowColor)}>
            {eyebrow}
          </span>
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-7 h-7 rounded-full transition-transform duration-200 group-hover:rotate-[20deg] group-hover:translate-x-0.5"
            style={{
              background:
                tone === 'dark'
                  ? 'rgba(255,255,255,0.08)'
                  : tone === 'accent'
                    ? 'rgba(0,0,0,0.08)'
                    : 'var(--lp-light)',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M5 11l6-6M5.5 5h5.5v5.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        <h3 className="mt-5 font-sans text-[26px] font-extrabold uppercase tracking-[-0.02em] leading-[1.02]">
          {title}
        </h3>
        <p className={cn('mt-3 text-pretty text-[13.5px] leading-relaxed', muted)}>{body}</p>
      </div>
      <div
        className="mx-5 mb-5 overflow-hidden min-h-[176px] flex flex-col"
        style={{
          background: vignetteBg,
          border: `1px solid ${vignetteBorder}`,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 4,
        }}
      >
        {vignette}
      </div>
    </Link>
  );
}

/* ============================================================================
   VIGNETTES — tiny mockups of what each door opens onto
   ============================================================================ */

function BriefVignette() {
  // Progress ticks fill one by one, hold, then reset. 7 ticks + 2-step pause.
  const total = 7;
  const cycle = total + 3;
  const [step, setStep] = useState(0);
  const [bids, setBids] = useState(4);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % cycle), 580);
    return () => clearInterval(id);
  }, [cycle]);

  // Bump bid count occasionally to feel alive
  useEffect(() => {
    const id = setInterval(() => setBids((b) => (b >= 7 ? 4 : b + 1)), 4200);
    return () => clearInterval(id);
  }, []);

  const filled = Math.min(step, total);

  return (
    <div className="px-4 py-4 space-y-3 flex-1 flex flex-col">
      <div className="flex items-center justify-between">
        <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          BRIEF · 0x12ab
        </span>
        <span className="mono text-[10px] tabular-nums text-[var(--lp-text-sub)]">2 min</span>
      </div>
      <p className="text-[13px] font-semibold leading-snug text-[var(--lp-dark)]">
        Spanish → Arabic legal translation. 14 pages.
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
          200
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          USDC
        </span>
        <span className="ml-2 mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
          · 5d · {bids} bids
        </span>
      </div>
      <div className="flex gap-[2px] pt-1">
        {Array.from({ length: total }).map((_, i) => {
          const isFresh = i === filled - 1;
          const isFilled = i < filled;
          return (
            <span
              key={i}
              className="flex-1 h-[4px] transition-colors duration-500"
              style={{
                background: isFresh
                  ? 'var(--lp-accent)'
                  : isFilled
                    ? 'var(--lp-dark)'
                    : 'rgba(0,0,0,0.08)',
                boxShadow: isFresh ? '0 0 10px 1px rgba(212,255,63,0.7)' : 'none',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function BidVignette() {
  // Re-trigger score ramp every cycle so the card always has visible motion.
  // The "season" counter forces the requestAnimationFrame ramp to restart.
  const [score, setScore] = useState(0);
  const [price, setPrice] = useState(30);
  const [season, setSeason] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const target = 82 + Math.floor(Math.random() * 7); // 82-88
    const duration = 1600;
    setScore(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setScore(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [season]);

  useEffect(() => {
    const id = setInterval(() => setSeason((s) => s + 1), 5400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setPrice((p) => {
        const delta = Math.floor(Math.random() * 5) - 2; // -2..+2
        return Math.max(27, Math.min(34, p + delta));
      });
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const filledSegments = Math.max(0, Math.min(10, Math.round((score / 100) * 10)));

  return (
    <div className="px-4 py-4 space-y-3 flex-1 flex flex-col">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <span className="mono text-[9px] uppercase tracking-[0.2em] font-semibold text-[var(--lp-accent)]">
            LEAD
          </span>
          <span className="mono text-[10px] text-white/70">0x1d36…35Ce</span>
        </span>
        <span className="inline-flex items-center gap-1.5 mono text-[10px] text-white/55">
          <span
            aria-hidden
            data-instrument-blink
            className="w-[5px] h-[5px]"
            style={{
              background: 'var(--lp-accent)',
              animation: 'instrumentBlink 1.6s ease-in-out infinite',
            }}
          />
          live
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="font-sans text-[26px] font-extrabold tabular-nums tracking-[-0.02em] text-white">
            {price}
          </span>
          <span className="mono text-[9px] uppercase tracking-[0.12em] text-white/55">USDC</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span
            key={season}
            className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-accent)] fade-up"
          >
            {score}
          </span>
          <span className="mono text-[9px] tracking-[0.08em] text-white/45">/100</span>
        </div>
      </div>
      <div className="flex gap-[2px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="flex-1 h-[3px] transition-colors"
            style={{
              background: i < filledSegments ? 'var(--lp-accent)' : 'rgba(255,255,255,0.10)',
              transitionDuration: '320ms',
              transitionDelay: `${i * 28}ms`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] mono text-white/55 pt-1">
        <span>counter 27 USDC</span>
        <span>ETA 4d</span>
      </div>
    </div>
  );
}

function StreamVignette() {
  // A rotating window of 3 visible events out of a pool. Every ~3 seconds a new
  // event arrives at the top and the older rows shift down; the bottom row drops.
  const pool = useMemo(
    () =>
      [
        { label: 'bid.scored', addr: '0x12ab…cd34', tone: 'buyer' as const },
        { label: 'deal.matched', addr: '0xa045…03c5', tone: 'system' as const },
        { label: 'escrow.funded', addr: '0xb2ca…f9c9', tone: 'buyer' as const },
        { label: 'milestone.released', addr: '0x4d61…4f75', tone: 'buyer' as const },
        { label: 'counter.issued', addr: '0xc469…6cb0', tone: 'buyer' as const },
        { label: 'listing.posted', addr: '0xf4ea…5c8b', tone: 'seller' as const },
        { label: 'bid.submitted', addr: '0x17e6…1176', tone: 'seller' as const },
      ],
    [],
  );
  const [head, setHead] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setHead((h) => (h + 1) % pool.length), 3200);
    return () => clearInterval(id);
  }, [pool.length]);

  const window = [0, 1, 2].map((i) => ({
    ...pool[(head + i) % pool.length],
    age: i === 0 ? 'now' : i === 1 ? '12s' : '38s',
  }));

  const toneColor = (tone: 'buyer' | 'seller' | 'system') =>
    tone === 'buyer'
      ? 'var(--lp-dark)'
      : tone === 'seller'
        ? 'rgba(0,0,0,0.65)'
        : 'rgba(0,0,0,0.4)';

  return (
    <div className="px-4 py-4 relative flex-1 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="mono text-[9px] uppercase tracking-[0.2em] font-semibold text-[var(--lp-dark)]/70">
          EVENT STREAM
        </span>
        <span className="inline-flex items-center gap-1.5 mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-dark)]/70">
          <span
            aria-hidden
            data-instrument-blink
            className="w-[5px] h-[5px]"
            style={{
              background: 'var(--lp-dark)',
              animation: 'instrumentBlink 1.6s ease-in-out infinite',
            }}
          />
          live
        </span>
      </div>
      <span
        aria-hidden
        className="absolute left-[27px] top-[44px] bottom-[18px] w-px"
        style={{ background: 'rgba(0,0,0,0.18)' }}
      />
      <ol key={head} className="space-y-1.5">
        {window.map((r, i) => (
          <li
            key={i}
            className={cn(
              'flex items-center gap-3 relative slide-in rounded-md px-1.5 py-1 -mx-1.5',
              i === 0 && 'row-flash',
            )}
            style={{ animationDelay: `${i * 60}ms`, opacity: 1 - i * 0.12 }}
          >
            <span
              aria-hidden
              className="relative shrink-0 w-2 h-2 rounded-full z-10"
              style={{
                background: toneColor(r.tone),
                outline: i === 0 ? '2px solid var(--lp-accent)' : 'none',
                outlineOffset: '-1px',
                boxShadow: i === 0 ? '0 0 0 4px rgba(212,255,63,0.32)' : 'none',
              }}
            />
            <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
              <span className="mono text-[11px] font-semibold tabular-nums tracking-tight text-[var(--lp-dark)]">
                {r.label}
              </span>
              <span className="mono text-[10px] tabular-nums text-[var(--lp-dark)]/65">
                {r.addr}
              </span>
            </div>
            <span className="mono text-[9px] tabular-nums text-[var(--lp-dark)]/55 shrink-0">
              {r.age}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ============================================================================
   BIG STAT TILE for the Live network band
   ============================================================================ */

function BigStatTile({
  label,
  value,
  unit,
  hint,
  loading,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden p-5"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/55">{label}</p>
      {loading ? (
        <div className="mt-3 h-8 w-20 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
      ) : (
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-sans text-[clamp(2rem,3.4vw,2.75rem)] font-extrabold tabular-nums tracking-[-0.02em] text-white leading-none">
            {value}
          </span>
          {unit && (
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/55">
              {unit}
            </span>
          )}
        </div>
      )}
      {hint && (
        <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">{hint}</p>
      )}
    </div>
  );
}
