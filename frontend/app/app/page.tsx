'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/shared/utils/cn';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { DealsFeed } from '@/features/deals/components/DealsFeed';
import { MoneyStrip } from '@/features/balances/components/MoneyStrip';
import { PageTour } from '@/shared/guide/PageTour';
import { HOME_TOUR_ID, HOME_STEPS } from '@/shared/guide/tours';
/// Below-the-fold bands. Dynamically imported so motion (NetworkTicker) and
/// the in-house SVG chart (OnChainProofBand) do not ship in the initial
/// /app bundle. Both render purely client-side, so SSR is off; the bands
/// fade in once the route is interactive.
///
/// Each `loading` placeholder reserves the band's eventual height so the
/// footer (and everything else below) doesn't get yanked downward when the
/// real component mounts. Without these, /app's CLS was 1.77 locally
/// (Speed Insights screenshot), dominated by `footer.bg-[var(--lp-light)]`
/// shifting 0.6452 + 0.1531 and `section.relative.left-1/2.w-bleed`
/// (NetworkTicker's wrapper) shifting 0.3968 as each band mounted. Heights
/// are tuned to the rendered desktop size; a slight over-reserve is fine,
/// any under-reserve brings CLS back.
const NetworkTicker = dynamic(
  () => import('@/features/activity/components/NetworkTicker').then((m) => m.NetworkTicker),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="relative left-1/2 w-bleed -translate-x-1/2"
        style={{ minHeight: 160, background: 'var(--lp-band-dark)' }}
      />
    ),
  },
);
const OnChainProofBand = dynamic(
  () => import('@/features/network/components/OnChainProofBand').then((m) => m.OnChainProofBand),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        style={{ minHeight: 1200, background: 'var(--lp-band-dark)' }}
      />
    ),
  },
);
/// Auth-only bands. Unauthenticated visitors never see them; keep their
/// code out of the initial bundle to save the round trip for the first paint.
/// No `loading` placeholder here because both bands return null when there's
/// nothing pending (the common case). Reserving height would create a
/// permanent empty gap for every user with a clean queue, which is worse
/// than the one-time shift when content arrives.
const PendingMatchesBand = dynamic(
  () => import('@/features/notifications/components/PendingMatchesBand').then((m) => m.PendingMatchesBand),
  { ssr: false },
);
const PendingDealsBand = dynamic(
  () => import('@/features/notifications/components/PendingDealsBand').then((m) => m.PendingDealsBand),
  { ssr: false },
);
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { SignInGate } from '@/shared/components/SignInGate';
import { LegacyBanner } from '@/shared/components/LegacyBanner';
import { MigrationBanner } from '@/shared/components/MigrationBanner';
import { shortAddress } from '@/shared/utils/format';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  CTAPill,
  BigStatTile,
} from '@/shared/components/Bands';

interface NetStats {
  deals: number;
  direct: number;
  agent: number;
  settled: number;
  usdc: number;
}

export default function AppHome() {
  const t = useTranslations().appHome;
  const router = useRouter();
  const { profile, isConnected, loading, fetchState } = useUserProfile();
  /// Pull `isLoading` from useAuth directly so we can hold the skeleton
  /// until auth resolves. Otherwise the page paints `SignInGate variant="hero"`
  /// briefly for already-authed users, then snaps to the real content,
  /// that flip was a major CLS contributor on /app (Speed Insights showed
  /// 0.82 sustained).
  const { isLoading: authLoading } = useAuth();

  /// Backend health probe + network-wide stats. Both ride the shared
  /// QueryClient cache, so navigating away and back doesn't re-blank the
  /// hero stat tiles. The dealsStats key is invalidated by the SSE bridge
  /// on every deal lifecycle event.
  const statusQuery = useQuery({
    queryKey: qk.status(),
    queryFn: () => api.status(),
    staleTime: 60_000,
  });
  const status = statusQuery.data ?? null;
  const statusChecked = !statusQuery.isPending;

  const statsQuery = useQuery({
    queryKey: qk.dealsStats(),
    queryFn: () => api.dealsStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const stats: NetStats | null = statsQuery.data
    ? {
        deals: statsQuery.data.total,
        direct: statsQuery.data.direct,
        agent: statsQuery.data.agent,
        settled: statsQuery.data.settled,
        usdc: statsQuery.data.volumeUsdc,
      }
    : null;

  useEffect(() => {
    if (isConnected && fetchState === 'success' && !profile) {
      router.replace('/onboarding');
    }
  }, [isConnected, fetchState, profile, router]);

  if (!statusChecked || authLoading) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">{t.settlementDeskEyebrow}</SectionTag>
          <div className="mt-7 space-y-4">
            <div className="h-14 w-3/4 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
            <div className="h-4 w-1/2 rounded-md bg-white/[0.04] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (!status) {
    return (
      <FullBleed>
        <Band tone="light">
          <SectionTag>{t.backendOffline.eyebrow}</SectionTag>
          <HeroHeadline>
            {t.backendOffline.title}<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-md">
            {t.backendOffline.bodyPrefix}
            <span className="mono text-[var(--lp-dark)]">{api.baseUrl}</span>
            {t.backendOffline.bodySuffix}
          </p>
        </Band>
      </FullBleed>
    );
  }

  if (!isConnected) {
    return <SignInGate variant="hero" />;
  }

  if (loading || !profile) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">{t.settlementDeskEyebrow}</SectionTag>
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
      <PageTour id={HOME_TOUR_ID} steps={HOME_STEPS} />
      <MigrationBanner />
      <LegacyBanner />
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot="live">
                {t.settlementDeskEyebrow}
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline>
                {t.hero.welcomeBack}
                <br />
                {profile.displayName}
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
              {t.hero.description}
            </p>
            <div
              data-guide="home-start"
              className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3"
            >
              {(profile.role === 'buyer' || profile.role === 'both') && (
                <CTAPill href="/buyer">{t.hero.postRequestCta}</CTAPill>
              )}
              {(profile.role === 'seller' || profile.role === 'both') && (
                <CTAPill
                  href="/seller"
                  variant={profile.role === 'seller' ? 'primary' : 'secondary'}
                  tone="dark"
                >
                  {t.hero.postOfferCta}
                </CTAPill>
              )}
              <CTAPill href="/activity" variant="secondary" tone="dark">
                {t.hero.viewActivityCta}
              </CTAPill>
              <span className="ms-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 mono text-[11px] uppercase tracking-[0.08em] text-white/65">
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

      {/* YOUR MONEY. First personal surface after the hero: where your money is
          and that it's safe, in plain dollars. The trust answer up front.
          (The tour target lives on the inner card grid in MoneyStrip so the
          spotlight fits the content, not the full-bleed band.) */}
      <MoneyStrip />

      {/* PENDING MATCHES. surfaces here so users see them from the home page
          without having to navigate to /seller. Renders nothing when there
          are none, so the layout stays clean for buyers / fresh users. */}
      <PendingMatchesBand tone="light" />
      <PendingDealsBand tone="light" />

      {/* THREE DOORS */}
      <Band tone="light">
        <SectionTag>{t.threeDoors.sectionTag}</SectionTag>
        <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
          {t.threeDoors.headlineTop}<Punc>.</Punc>
          <br />
          {t.threeDoors.headlineBottom}
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          {t.threeDoors.description}
        </p>
        <div data-guide="home-doors" className="mt-12 grid md:grid-cols-3 gap-5">
          <div className="fade-up fade-up-1">
            <FeatureCard
              href="/buyer"
              tone="cream"
              eyebrow={t.threeDoors.buyerCard.eyebrow}
              title={t.threeDoors.buyerCard.title}
              body={t.threeDoors.buyerCard.body}
              vignette={<BriefVignette />}
            />
          </div>
          <div className="fade-up fade-up-2">
            <FeatureCard
              href="/seller"
              tone="dark"
              eyebrow={t.threeDoors.sellerCard.eyebrow}
              title={t.threeDoors.sellerCard.title}
              body={t.threeDoors.sellerCard.body}
              vignette={<BidVignette />}
            />
          </div>
          <div className="fade-up fade-up-3">
            <FeatureCard
              href="/activity"
              tone="accent"
              eyebrow={t.threeDoors.activityCard.eyebrow}
              title={t.threeDoors.activityCard.title}
              body={t.threeDoors.activityCard.body}
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
              {t.liveNetwork.sectionTag}
            </SectionTag>
            <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
              {t.liveNetwork.headlineTop}
              <br />
              {t.liveNetwork.headlineBottomPrefix}<Accent>{t.liveNetwork.headlineBottomAccent}</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
          </div>
          <Link
            href="/activity"
            className="group inline-flex items-center gap-1.5 mono text-[12px] uppercase tracking-[0.08em] text-white/70 hover:text-white transition-colors"
          >
            {t.liveNetwork.fullFeed}
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="fade-up fade-up-1">
            <BigStatTile
              label={t.liveNetwork.stats.totalDeals}
              value={<AnimatedNumber value={stats?.deals ?? 0} decimals={0} />}
              hint={t.liveNetwork.stats.directPlusAgent}
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-2">
            <BigStatTile
              label={t.liveNetwork.stats.directDeals}
              value={<AnimatedNumber value={stats?.direct ?? 0} decimals={0} />}
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-3">
            <BigStatTile
              label={t.liveNetwork.stats.agentDeals}
              value={<AnimatedNumber value={stats?.agent ?? 0} decimals={0} />}
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-4">
            <BigStatTile
              label={t.liveNetwork.stats.settled}
              value={<AnimatedNumber value={stats?.settled ?? 0} decimals={0} />}
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-4">
            <BigStatTile
              label={t.liveNetwork.stats.usdcThrough}
              value={<AnimatedNumber value={stats?.usdc ?? 0} decimals={2} />}
              unit="USDC"
              loading={!stats}
            />
          </div>
          <div className="fade-up fade-up-4">
            <BigStatTile label={t.liveNetwork.stats.chain} value="5042002" hint={t.liveNetwork.stats.arcTestnet} />
          </div>
        </div>
      </Band>

      {/* ON-CHAIN PROOF. Numbers and a 30-day chart read directly from contract
          events on the current production deploy. Provable by anyone who curls
          /api/network/onchain or hits the contract addresses on Arc Explorer. */}
      <OnChainProofBand />

      {/* NETWORK PULSE. sliding evidence ticker. Pure read-only proof that
          deals are flowing; never links anywhere, never asks for action. */}
      <Band tone="dark" compact>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[44ch]">
            <SectionTag tone="dark" dot="live">
              {t.networkPulse.sectionTag}
            </SectionTag>
            <HeroHeadline size="md">
              {t.networkPulse.headlinePrefix}<Accent>{t.networkPulse.headlineAccent}</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
          </div>
        </div>
      </Band>
      <NetworkTicker />

      {/* DEALS ACROSS KARWAN */}
      <Band tone="light">
        <SectionTag>{t.yourBook.sectionTag}</SectionTag>
        <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
          {t.yourBook.headlinePrefix}<Accent>{t.yourBook.headlineAccent}</Accent><Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-10 -mx-[clamp(20px,5vw,72px)] -mb-[clamp(64px,9vw,140px)] lg:-mb-0">
          <div
            data-guide="home-deals"
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

// Hero agent card. small "control panel" vignette on the right of hero

function HeroAgentCard({
  dealsRunning,
  settled,
  usdcThrough,
}: {
  dealsRunning: number | null;
  settled: number | null;
  usdcThrough: number | null;
}) {
  const t = useTranslations().appHome.heroAgentCard;
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'var(--surface-1)',
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
            {t.eyebrow}
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
          {t.statePrefix} <span className="text-[var(--lp-accent)]">{t.stateActive}</span>
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          {t.stateBody}
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/[0.08]">
        <MiniStat label={t.miniLabels.running} value={dealsRunning} />
        <MiniStat label={t.miniLabels.settled} value={settled} />
        <MiniStat
          label={t.miniLabels.volume}
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
        {value == null ? '-' : <AnimatedNumber value={value} decimals={decimals} />}
      </p>
      {unit && (
        <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">{unit}</p>
      )}
    </div>
  );
}

// Feature card with internal vignette. the Phantom move

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
      ? 'bg-[var(--lp-band-dark)] text-white'
      : tone === 'accent'
        ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)]'
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

// Vignettes. tiny mockups of what each door opens onto

function BriefVignette() {
  // Progress ticks fill one by one, hold, then reset. 7 ticks + 2-step pause.
  const total = 7;
  const cycle = total + 3;
  const t = useTranslations().appHome.briefVignette;
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
          {t.eyebrowPrefix} 0x12ab
        </span>
        <span className="mono text-[10px] tabular-nums text-[var(--lp-text-sub)]">{t.timeStamp}</span>
      </div>
      <p className="text-[13px] font-semibold leading-snug text-[var(--lp-dark)]">
        {t.sampleBrief}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
          200
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          USDC
        </span>
        <span className="ms-2 mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
          {t.daysBids.replace('{bids}', String(bids))}
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
                boxShadow: isFresh ? '0 0 10px 1px rgba(175, 201, 91,0.7)' : 'none',
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
  const t = useTranslations().appHome.bidVignette;
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
            {t.eyebrow}
          </span>
          <span className="mono text-[10px] text-white/70">0x1d36...35Ce</span>
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
          {t.live}
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
          <span className="mono text-[9px] tracking-[0.08em] text-white/45">{t.scoreSuffix}</span>
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
        <span>{t.counter.replace('{price}', '27')}</span>
        <span>{t.eta}</span>
      </div>
    </div>
  );
}

function StreamVignette() {
  // A rotating window of 3 visible events out of a pool. Every ~3 seconds a new
  // event arrives at the top and the older rows shift down; the bottom row drops.
  const t = useTranslations().appHome.streamVignette;
  const pool = useMemo(
    () =>
      [
        { label: 'bid.scored', addr: '0x12ab...cd34', tone: 'buyer' as const },
        { label: 'deal.matched', addr: '0xa045...03c5', tone: 'system' as const },
        { label: 'escrow.funded', addr: '0xb2ca...f9c9', tone: 'buyer' as const },
        { label: 'milestone.released', addr: '0x4d61...4f75', tone: 'buyer' as const },
        { label: 'counter.issued', addr: '0xc469...6cb0', tone: 'buyer' as const },
        { label: 'listing.posted', addr: '0xf4ea...5c8b', tone: 'seller' as const },
        { label: 'bid.submitted', addr: '0x17e6...1176', tone: 'seller' as const },
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
    age: i === 0 ? t.now : i === 1 ? '12s' : '38s',
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
          {t.eyebrow}
        </span>
        <span className="inline-flex items-center gap-1.5 mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-dark)]/70">
          <span
            aria-hidden
            data-instrument-blink
            className="w-[5px] h-[5px]"
            style={{
              background: 'var(--lp-band-dark)',
              animation: 'instrumentBlink 1.6s ease-in-out infinite',
            }}
          />
          {t.live}
        </span>
      </div>
      <span
        aria-hidden
        className="absolute start-[27px] top-[44px] bottom-[18px] w-px"
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
                boxShadow: i === 0 ? '0 0 0 4px rgba(175, 201, 91,0.32)' : 'none',
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

