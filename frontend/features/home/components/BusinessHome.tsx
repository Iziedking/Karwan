'use client';
import { buttonClasses } from '@/shared/components/Button';
import { Price } from '@/features/money/components/Price';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type TradeAvailability, type UserProfile } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { DealsFeed } from '@/features/deals/components/DealsFeed';
import { HomeDeals } from './HomeDeals';
import { OnChainProofBand } from '@/features/network/components/OnChainProofBand';
import { LiveNetworkBand, type LiveNetworkStats } from '@/features/home/components/LiveNetworkBand';
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
  PageCard,
} from '@/shared/components/Bands';
import { Icon } from '@/shared/components/Icon';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

type BusinessStatus = 'none' | 'submitted' | 'verified' | 'rejected';

const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-funding',
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
  workspaceId,
  stats,
}: {
  profile: UserProfile;
  status: BusinessStatus;
  companyName: string;
  workspaceId: string;
  stats: LiveNetworkStats | null;
}) {
  const mt = useMoneyText({ compact: true });
  const t = useTranslations();
  const bh = t.businessHome;
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
            <p className="fade-up fade-up-2 mt-5 text-pretty text-[15px] leading-relaxed text-[var(--ink-muted)] max-w-[46ch]">
              {bh.hero.description}
            </p>
            <div
              className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3"
              data-guide="biz-desk"
            >
              {/* A business's primary action is its own B2B trade (agent-matched
                  via /buyer, or a direct deal). The financier desk, where they
                  fund other businesses' invoices, is a secondary capability. */}
              <CTAPill href="/market?scope=business">Find supply</CTAPill>
              <CTAPill href="/seller" variant="secondary" tone="dark">
                Post what we offer
              </CTAPill>
              <CTAPill href="/buyer?mode=direct" variant="secondary" tone="dark">
                Bring a deal
              </CTAPill>
              <CTAPill href="/financier" variant="secondary" tone="dark">
                Finance a trade
              </CTAPill>
              <span className="ms-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--line)] text-[14px] font-semibold text-[var(--ink-secondary)]">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--ink-muted)]" />
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

      <Band tone="light" compact>
        <HomeDeals />
      </Band>

      <BusinessAvailability workspaceId={workspaceId} />

      {/* TRADE ANALYTICS. the company's own book, with a cumulative-volume chart */}
      <Band tone="light">
        <SectionTag>{bh.analytics.sectionTag}</SectionTag>
        <HeroHeadline as="h2" className="text-[clamp(2rem,4.6vw,3.75rem)]">
          {bh.analytics.headlinePrefix}
          <Accent>{bh.analytics.headlineAccent}</Accent>.
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--ink-secondary)] max-w-[46ch]">
          {bh.analytics.description}
        </p>

        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3" data-guide="biz-book">
          <BookTile label={bh.analytics.tiles.total} value={book.total} />
          <BookTile label={bh.analytics.tiles.active} value={book.active} />
          <BookTile label={bh.analytics.tiles.settled} value={book.settled} />
          <BookTile label={bh.analytics.tiles.volume} value={book.volume} decimals={2} money />
        </div>

        <div className="mt-5">
          <PageCard>
            <div className="p-5 md:p-7">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold text-[var(--ink-muted)]">
                  {bh.analytics.chartTitle}
                </span>
                <span className="text-[14px] font-semibold text-[var(--ink-muted)] tabular-nums">
                  {mt.text(book.volume)}
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
      <LiveNetworkBand stats={stats} />

      <OnChainProofBand />

      {/* DEAL HISTORY. the company's own book */}
      <Band tone="light">
        <SectionTag>{bh.history.sectionTag}</SectionTag>
        <HeroHeadline as="h2" className="text-[clamp(2rem,4.6vw,3.75rem)]">
          {bh.history.headlinePrefix}
          <Accent>{bh.history.headlineAccent}</Accent>.
        </HeroHeadline>
        <div className="mt-10 -mx-[clamp(20px,5vw,72px)] -mb-[clamp(64px,9vw,140px)] lg:-mb-0">
          <div
            className="bg-[var(--surface)] overflow-hidden lg:rounded-tl-[28px] lg:rounded-tr-[28px] lg:rounded-bl-[28px] lg:rounded-br-[6px]"
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

function BusinessAvailability({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [tradeType, setTradeType] = useState<'goods' | 'services'>('goods');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: qk.workspaces.availability(workspaceId),
    queryFn: () => api.getTradeAvailability(workspaceId),
    staleTime: 30_000,
  });
  const records = query.data?.availability ?? [];

  async function addRecord() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveTradeAvailability(workspaceId, {
        tradeType,
        title: title.trim(),
        ...(region.trim() ? { region: region.trim() } : {}),
        active: true,
      });
      setTitle('');
      setRegion('');
      await queryClient.invalidateQueries({ queryKey: qk.workspaces.availability(workspaceId) });
    } catch {
      setError('Could not save this availability yet. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: TradeAvailability) {
    try {
      await api.removeTradeAvailability(workspaceId, record.id);
      await queryClient.invalidateQueries({ queryKey: qk.workspaces.availability(workspaceId) });
    } catch {
      setError('Could not remove this record yet. Try again.');
    }
  }

  return (
    <Band tone="dark">
      <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div>
          <SectionTag tone="dark">What we offer</SectionTag>
          <HeroHeadline as="h2" className="text-[clamp(2rem,4.6vw,3.75rem)]">
            Make supply <Accent>easy to find</Accent>.
          </HeroHeadline>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-[var(--ink-muted)]">
            Keep a simple, current record of the goods and services your business can trade.
          </p>
        </div>
        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 md:p-6">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.7fr)_auto] sm:items-end">
            <label className="text-[14px] text-[var(--ink-secondary)]">
              Type
              <select value={tradeType} onChange={(event) => setTradeType(event.target.value as 'goods' | 'services')} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--raised)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--ink)]">
                <option value="goods">Goods</option>
                <option value="services">Services</option>
              </select>
            </label>
            <label className="text-[14px] text-[var(--ink-secondary)]">
              What can you trade?
              <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addRecord(); }} placeholder="e.g. Solar lamps" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--raised)] px-3 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--ink)]" />
            </label>
            <label className="text-[14px] text-[var(--ink-secondary)]">
              Region
              <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Optional" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--raised)] px-3 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--ink)]" />
            </label>
            <button type="button" onClick={() => void addRecord()} disabled={!title.trim() || saving} className={buttonClasses({ variant: 'secondary', size: 'md' })}>{saving ? 'Saving…' : 'Add'}</button>
          </div>
          {error ? <p role="alert" className="mt-3 text-[14px] text-[var(--ink-secondary)]">{error}</p> : null}
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            {query.isPending ? <p className="text-[14px] text-[var(--ink-secondary)]">Loading availability…</p> : records.length === 0 ? <p className="text-[14px] text-[var(--ink-secondary)]">Nothing listed yet. Add the first thing this business is ready to trade.</p> : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {records.map((record) => (
                  <li key={record.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-3">
                    <span className="text-[14px] font-medium text-[var(--ink-secondary)]">{record.tradeType}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--ink)]">{record.title}</span>
                    {record.region ? <span className="hidden truncate text-[14px] text-[var(--ink-secondary)] sm:block">{record.region}</span> : null}
                    <button type="button" onClick={() => void removeRecord(record)} aria-label={`Remove ${record.title}`} className="text-[16px] text-[var(--ink-secondary)] hover:text-[var(--ink)]">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Band>
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
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--line-strong)] text-[14px] font-medium text-[var(--ink)]">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--action)]" />
        {bh.status.verified}
      </span>
    );
  }
  if (status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--line)] text-[14px] font-semibold text-[var(--ink-secondary)]">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--ink-muted)]" />
        {bh.status.underReview}
      </span>
    );
  }
  // none / rejected: take the business to the dedicated completion workflow.
  return (
    <Link
      href="/business/verification"
      className="inline-flex min-h-11 items-center gap-2 px-3 py-2 rounded-full border border-[var(--line)] text-[14px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:border-[var(--ink)] transition-colors"
    >
      {bh.status.finishVerification}
      <Icon name="arrow-right" size={16} directional />
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
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: 16,
      }}
    >
      <div className="px-6 pt-6 pb-5 border-b border-[var(--line)] flex items-center justify-between">
        <span className="text-[14px] font-semibold text-[var(--ink-secondary)]">{eyebrow}</span>
        <span
          aria-hidden
          className="size-2 rounded-full bg-[var(--action)]"
        />
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--line)]">
        <CardStat label={labels.active} value={active} />
        <CardStat label={labels.settled} value={settled} />
        <CardStat label={labels.volume} value={volume} decimals={2} money />
      </div>
    </div>
  );
}

function CardStat({
  label,
  value,
  decimals = 0,
  unit,
  money = false,
}: {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
  /// A USDC amount, read in the account's currency (view 55).
  money?: boolean;
  }) {
  return (
    <div className="px-4 py-5">
      <p className="text-[14px] font-semibold text-[var(--ink-secondary)]">{label}</p>
      <p className="mt-1.5 font-sans text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--ink)]">
        {money ? <Price usdc={value} size="inline" /> : <AnimatedNumber value={value} decimals={decimals} />}
      </p>
      {unit && !money && (
        <p className="mt-0.5 text-[14px] font-semibold text-[var(--ink-secondary)]">{unit}</p>
      )}
    </div>
  );
}

function BookTile({
  label,
  value,
  decimals = 0,
  unit,
  money = false,
}: {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
  /// A USDC amount, read in the account's currency (view 55).
  money?: boolean;
}) {
  return (
    <div
      className="p-5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 14,
      }}
    >
      <p className="text-[14px] font-semibold text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 font-sans text-[28px] font-semibold tabular-nums tracking-[-0.025em] leading-none text-[var(--ink)]">
        {money ? <Price usdc={value} size="inline" /> : <AnimatedNumber value={value} decimals={decimals} />}
      </p>
      {unit && !money && (
        <p className="mt-1 text-[14px] font-semibold text-[var(--ink-muted)]">
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
  const a11y = useTranslations().a11y;
  const W = 720;
  const H = 200;
  const PAD = 6;

  if (series.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <p className="text-[14px] font-semibold text-[var(--ink-muted)] text-center max-w-[34ch]">
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
      aria-label={a11y.cumulativeTradeVolume}
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD - g * (H - PAD * 2)}
          y2={H - PAD - g * (H - PAD * 2)}
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}
      <path d={areaPath} fill="var(--ink)" fillOpacity={0.08} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {n <= 24 &&
        pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.v)} r={2.5} fill="var(--ink)" />
        ))}
    </svg>
  );
}
