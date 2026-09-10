'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type TradeAvailability, type UserProfile } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { DealsFeed } from '@/features/deals/components/DealsFeed';
import { PendingDealsBand } from '@/features/notifications/components/PendingDealsBand';
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
              <CTAPill href="/partners">Find supply</CTAPill>
              <CTAPill href="/supply" variant="secondary" tone="dark">
                Post what we offer
              </CTAPill>
              <CTAPill href="/buyer?mode=direct" variant="secondary" tone="dark">
                Bring a deal
              </CTAPill>
              <CTAPill href="/financier" variant="secondary" tone="dark">
                Finance a trade
              </CTAPill>
              <span className="ms-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--lp-workspace-border)] mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-workspace-muted)]">
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

      <PendingDealsBand tone="light" />

      <BusinessAvailability workspaceId={workspaceId} />

      {/* TRADE ANALYTICS. the company's own book, with a cumulative-volume chart */}
      <Band tone="light">
        <SectionTag>{bh.analytics.sectionTag}</SectionTag>
        <HeroHeadline as="h2" className="text-[clamp(2rem,4.6vw,3.75rem)]">
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
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            Keep a simple, current record of the goods and services your business can trade.
          </p>
        </div>
        <div className="rounded-[20px] border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-raised)] p-5 md:p-6">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.7fr)_auto] sm:items-end">
            <label className="text-[12px] text-[var(--lp-workspace-muted)]">
              Type
              <select value={tradeType} onChange={(event) => setTradeType(event.target.value as 'goods' | 'services')} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-band)] px-3 text-[13px] text-[var(--lp-workspace-ink)] outline-none focus:border-[var(--lp-accent)]">
                <option value="goods">Goods</option>
                <option value="services">Services</option>
              </select>
            </label>
            <label className="text-[12px] text-[var(--lp-workspace-muted)]">
              What can you trade?
              <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addRecord(); }} placeholder="e.g. Solar lamps" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-band)] px-3 text-[13px] text-[var(--lp-workspace-ink)] outline-none placeholder:text-[var(--lp-workspace-faint)] focus:border-[var(--lp-accent)]" />
            </label>
            <label className="text-[12px] text-[var(--lp-workspace-muted)]">
              Region
              <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Optional" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-band)] px-3 text-[13px] text-[var(--lp-workspace-ink)] outline-none placeholder:text-[var(--lp-workspace-faint)] focus:border-[var(--lp-accent)]" />
            </label>
            <button type="button" onClick={() => void addRecord()} disabled={!title.trim() || saving} className="min-h-11 rounded-full bg-[var(--lp-accent)] px-4 text-[13px] font-bold text-[#10170b] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Add'}</button>
          </div>
          {error ? <p role="alert" className="mt-3 text-[12px] text-[var(--lp-workspace-muted)]">{error}</p> : null}
          <div className="mt-5 border-t border-[var(--lp-workspace-border)] pt-4">
            {query.isPending ? <p className="text-[12px] text-[var(--lp-workspace-muted)]">Loading availability…</p> : records.length === 0 ? <p className="text-[12px] text-[var(--lp-workspace-muted)]">Nothing listed yet. Add the first thing this business is ready to trade.</p> : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {records.map((record) => (
                  <li key={record.id} className="flex items-center gap-3 rounded-xl border border-[var(--lp-workspace-border)] px-3 py-3">
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-accent)]">{record.tradeType}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--lp-workspace-ink)]">{record.title}</span>
                    {record.region ? <span className="hidden truncate text-[11px] text-[var(--lp-workspace-muted)] sm:block">{record.region}</span> : null}
                    <button type="button" onClick={() => void removeRecord(record)} aria-label={`Remove ${record.title}`} className="text-[16px] text-[var(--lp-workspace-muted)] hover:text-[var(--lp-workspace-ink)]">×</button>
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
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--lp-accent)]/40 mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-accent)]">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
        {bh.status.verified}
      </span>
    );
  }
  if (status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--lp-workspace-border)] mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-workspace-muted)]">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-workspace-faint)]" />
        {bh.status.underReview}
      </span>
    );
  }
  // none / rejected: take the business to the dedicated completion workflow.
  return (
    <Link
      href="/business/verification"
      className="inline-flex min-h-11 items-center gap-2 px-3 py-2 rounded-full border border-[var(--lp-workspace-border)] mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-workspace-muted)] hover:text-[var(--lp-workspace-ink)] hover:border-[var(--lp-workspace-ink)] transition-colors"
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
        background: 'var(--lp-workspace-raised)',
        color: 'var(--lp-workspace-ink)',
        border: '1px solid var(--lp-workspace-border)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="px-6 pt-6 pb-5 border-b border-[var(--lp-workspace-border)] flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-workspace-muted)]">{eyebrow}</span>
        <span
          aria-hidden
          className="w-[7px] h-[7px]"
          style={{
            background: 'var(--lp-accent)',
            animation: 'instrumentBlink 1.6s ease-in-out infinite',
          }}
        />
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--lp-workspace-border)]">
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
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-workspace-muted)]">{label}</p>
      <p className="mt-1.5 font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-workspace-ink)]">
        <AnimatedNumber value={value} decimals={decimals} />
      </p>
      {unit && (
        <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-workspace-muted)]">{unit}</p>
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
  const a11y = useTranslations().a11y;
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
      aria-label={a11y.cumulativeTradeVolume}
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
