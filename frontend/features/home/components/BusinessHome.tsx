'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import type { UserProfile } from '@/core/api';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { DealsFeed } from '@/features/deals/components/DealsFeed';
import { MoneyStrip } from '@/features/balances/components/MoneyStrip';
import { PendingMatchesBand } from '@/features/notifications/components/PendingMatchesBand';
import { PendingDealsBand } from '@/features/notifications/components/PendingDealsBand';
import { OnChainProofBand } from '@/features/network/components/OnChainProofBand';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { PageTour } from '@/shared/guide/PageTour';
import { BIZ_HOME_TOUR_ID, BIZ_HOME_STEPS } from '@/shared/guide/tours';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
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
  PageCard,
} from '@/shared/components/Bands';

type BusinessStatus = 'none' | 'submitted' | 'verified' | 'rejected';

interface NetStats {
  deals: number;
  direct: number;
  agent: number;
  settled: number;
  usdc: number;
}

const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-delivery',
  'awaiting-first-release',
  'awaiting-final-release',
];

/// Home surface for accounts on the business track. Replaces the P2P hero
/// (post a request / post an offer) with a trade desk: a book summary, a
/// cumulative-volume chart drawn from the company's own deals, the live
/// network numbers, the on-chain proof chart, and the deal history feed.
/// Every action points at the SME desk. Person accounts never render this;
/// page.tsx branches on the verification status before mounting it.
export function BusinessHome({
  profile,
  status,
  companyName,
  stats,
}: {
  profile: UserProfile;
  status: BusinessStatus;
  companyName: string;
  stats: NetStats | null;
}) {
  const t = useTranslations();
  const bh = t.businessHome;
  const ah = t.appHome;
  const { deals } = useDirectDeals();

  const book = useMemo(() => {
    const withStage = deals.map((d) => ({ deal: d, stage: stageOf(d) }));
    const active = withStage.filter((x) => ACTIVE_STAGES.includes(x.stage)).length;
    const settled = withStage.filter((x) => x.stage === 'settled').length;
    const volume = deals.reduce((sum, d) => sum + (Number(d.dealAmountUsdc) || 0), 0);
    // Cumulative volume over time, oldest deal first. Drives the area chart.
    const series = [...deals]
      .sort((a, b) => a.createdAt - b.createdAt)
      .reduce<Array<{ t: number; v: number }>>((acc, d) => {
        const prev = acc.length ? acc[acc.length - 1]!.v : 0;
        acc.push({ t: d.createdAt, v: prev + (Number(d.dealAmountUsdc) || 0) });
        return acc;
      }, []);
    return { total: deals.length, active, settled, volume, series };
  }, [deals]);

  return (
    <FullBleed>
      <PageTour id={BIZ_HOME_TOUR_ID} steps={BIZ_HOME_STEPS} />
      {/* HERO. trade desk, no post-request / post-offer */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot="live">
                {bh.deskEyebrow}
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline>
                {bh.hero.welcomeBack}
                <br />
                {companyName}
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <div className="fade-up fade-up-2 mt-5" data-guide="biz-verify">
              <StatusChip status={status} bh={bh} />
            </div>
            <p className="fade-up fade-up-2 mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
              {bh.hero.description}
            </p>
            <div
              className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3"
              data-guide="biz-desk"
            >
              {/* A business's primary action is its own B2B trade (agent-matched
                  via /buyer, or a direct deal). The financier desk, where they
                  fund other businesses' invoices, is a secondary capability. */}
              <CTAPill href="/buyer">{bh.hero.newTradeCta}</CTAPill>
              <CTAPill href="/deals" variant="secondary" tone="dark">
                Direct deal
              </CTAPill>
              <CTAPill href="/financier" variant="secondary" tone="dark">
                Financier desk
              </CTAPill>
              <span className="ms-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 mono text-[11px] uppercase tracking-[0.08em] text-white/65">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
                {shortAddress(profile.address)}
              </span>
            </div>
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <BookSummaryCard
              eyebrow={bh.bookCard.eyebrow}
              active={book.active}
              settled={book.settled}
              volume={book.volume}
              labels={bh.bookCard}
            />
          </div>
        </div>
      </Band>

      <MoneyStrip />

      <PendingMatchesBand tone="light" />
      <PendingDealsBand tone="light" />

      {/* TRADE ANALYTICS. the company's own book, with a cumulative-volume chart */}
      <Band tone="light">
        <SectionTag>{bh.analytics.sectionTag}</SectionTag>
        <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
          {bh.analytics.headlinePrefix}
          <Accent>{bh.analytics.headlineAccent}</Accent>.
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          {bh.analytics.description}
        </p>

        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3" data-guide="biz-book">
          <BookTile label={bh.analytics.tiles.total} value={book.total} />
          <BookTile label={bh.analytics.tiles.active} value={book.active} />
          <BookTile label={bh.analytics.tiles.settled} value={book.settled} />
          <BookTile label={bh.analytics.tiles.volume} value={book.volume} decimals={2} unit="USDC" />
        </div>

        <div className="mt-5">
          <PageCard>
            <div className="p-5 md:p-7">
              <div className="flex items-center justify-between gap-3">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  {bh.analytics.chartTitle}
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
                  {book.volume.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
                </span>
              </div>
              <div className="mt-5">
                <VolumeChart series={book.series} emptyLabel={bh.analytics.chartEmpty} />
              </div>
            </div>
          </PageCard>
        </div>
      </Band>

      {/* LIVE NETWORK. everything happening across Karwan */}
      <Band tone="dark">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[42ch]">
            <SectionTag tone="dark" dot="live">
              {ah.liveNetwork.sectionTag}
            </SectionTag>
            <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
              {ah.liveNetwork.headlineTop}
              <br />
              {ah.liveNetwork.headlineBottomPrefix}
              <Accent>{ah.liveNetwork.headlineBottomAccent}</Accent>.
            </HeroHeadline>
          </div>
          <Link
            href="/activity"
            className="group inline-flex items-center gap-1.5 mono text-[12px] uppercase tracking-[0.08em] text-white/70 hover:text-white transition-colors"
          >
            {ah.liveNetwork.fullFeed}
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3">
          <BigStatTile
            label={ah.liveNetwork.stats.totalDeals}
            value={<AnimatedNumber value={stats?.deals ?? 0} decimals={0} />}
            hint={ah.liveNetwork.stats.directPlusAgent}
            loading={!stats}
          />
          <BigStatTile
            label={ah.liveNetwork.stats.settled}
            value={<AnimatedNumber value={stats?.settled ?? 0} decimals={0} />}
            loading={!stats}
          />
          <BigStatTile
            label={ah.liveNetwork.stats.usdcThrough}
            value={<AnimatedNumber value={stats?.usdc ?? 0} decimals={2} />}
            unit="USDC"
            loading={!stats}
          />
        </div>
      </Band>

      <OnChainProofBand />

      {/* DEAL HISTORY. the company's own book */}
      <Band tone="light">
        <SectionTag>{bh.history.sectionTag}</SectionTag>
        <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
          {bh.history.headlinePrefix}
          <Accent>{bh.history.headlineAccent}</Accent>.
        </HeroHeadline>
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

function StatusChip({
  status,
  bh,
}: {
  status: BusinessStatus;
  bh: ReturnType<typeof useTranslations>['businessHome'];
}) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--lp-accent)]/40 mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-accent)]">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
        {bh.status.verified}
      </span>
    );
  }
  if (status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-white/50" />
        {bh.status.underReview}
      </span>
    );
  }
  // none / rejected: business intent without a live submission. Point to /profile.
  return (
    <Link
      href="/profile?verify=business"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/70 hover:text-white hover:border-white/40 transition-colors"
    >
      {bh.status.finishVerification}
      <span aria-hidden>→</span>
    </Link>
  );
}

function BookSummaryCard({
  eyebrow,
  active,
  settled,
  volume,
  labels,
}: {
  eyebrow: string;
  active: number;
  settled: number;
  volume: number;
  labels: { active: string; settled: string; volume: string };
}) {
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
      <div className="px-6 pt-6 pb-5 border-b border-white/[0.08] flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">{eyebrow}</span>
        <span
          aria-hidden
          className="w-[7px] h-[7px]"
          style={{
            background: 'var(--lp-accent)',
            animation: 'instrumentBlink 1.6s ease-in-out infinite',
          }}
        />
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/[0.08]">
        <CardStat label={labels.active} value={active} />
        <CardStat label={labels.settled} value={settled} />
        <CardStat label={labels.volume} value={volume} decimals={2} unit="USDC" />
      </div>
    </div>
  );
}

function CardStat({
  label,
  value,
  decimals = 0,
  unit,
}: {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
}) {
  return (
    <div className="px-4 py-5">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-1.5 font-sans text-[20px] font-extrabold tabular-nums tracking-[-0.02em] text-white">
        <AnimatedNumber value={value} decimals={decimals} />
      </p>
      {unit && (
        <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">{unit}</p>
      )}
    </div>
  );
}

function BookTile({
  label,
  value,
  decimals = 0,
  unit,
}: {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
}) {
  return (
    <div
      className="p-5"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">{label}</p>
      <p className="mt-2 font-sans text-[28px] font-extrabold tabular-nums tracking-[-0.025em] leading-none text-[var(--lp-dark)]">
        <AnimatedNumber value={value} decimals={decimals} />
      </p>
      {unit && (
        <p className="mt-1 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {unit}
        </p>
      )}
    </div>
  );
}

/// Dependency-free cumulative-volume area chart drawn straight from the
/// company's deal book. viewBox-scaled so it stays crisp at any width.
function VolumeChart({
  series,
  emptyLabel,
}: {
  series: Array<{ t: number; v: number }>;
  emptyLabel: string;
}) {
  const W = 720;
  const H = 200;
  const PAD = 6;

  if (series.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)] text-center max-w-[34ch]">
          {emptyLabel}
        </p>
      </div>
    );
  }

  // Cumulative volume starts at zero. When the first datapoint already carries
  // a balance — the common early case, a couple of settlements landing close
  // together — the raw series is a flat plateau pinned to the top edge and
  // reads as an empty ceiling line. Prepend a zero origin so the curve visibly
  // ramps up from the baseline, and give the peak 18% headroom so it never
  // touches the top.
  const pts = series[0]!.v > 0 ? [{ t: series[0]!.t, v: 0 }, ...series] : series;
  const maxV = Math.max(...pts.map((p) => p.v), 1) * 1.18;
  const n = pts.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - (v / maxV) * (H - PAD * 2);

  const linePts = pts.map((p, i) => `${x(i)},${y(p.v)}`);
  const areaPath = `M ${x(0)},${H - PAD} L ${linePts.join(' L ')} L ${x(n - 1)},${H - PAD} Z`;
  const linePath = `M ${linePts.join(' L ')}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label="Cumulative trade volume"
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD - g * (H - PAD * 2)}
          y2={H - PAD - g * (H - PAD * 2)}
          stroke="var(--lp-border-light)"
          strokeWidth={1}
        />
      ))}
      <path d={areaPath} fill="var(--lp-accent)" fillOpacity={0.14} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--lp-accent)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {n <= 24 &&
        pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.v)} r={2.5} fill="var(--lp-dark)" />
        ))}
    </svg>
  );
}
