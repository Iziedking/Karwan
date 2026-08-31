'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type NetworkOnchainDayPoint, type NetworkOnchainStats } from '@/core/api';
import {
  Band,
  SectionTag,
  HeroHeadline,
  Accent,
} from '@/shared/components/Bands';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { RotatingDataPanel } from '@/shared/components/RotatingDataPanel';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Home-page band that surfaces stats read directly from current-contract
/// events. Every count and volume below comes from a public chain read; the
/// caption at the bottom names the block window and the contract addresses
/// scanned so anyone can verify.
export function OnChainProofBand() {
  const t = useTranslations().onChainProof;
  const [stats, setStats] = useState<NetworkOnchainStats | null>(null);
  const [errored, setErrored] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /// Fetch the snapshot with a 60s wall clock. Cold-cache builds on the
  /// backend chunk through 30 days of log history on Arc public RPC and
  /// can legitimately run 30-50s on a fresh process boot before the disk
  /// snapshot fix landed. 60s gives the build genuine room to finish
  /// before flipping into the error state. Each call cancels any
  /// in-flight predecessor so manual retry + interval poll don't stack.
  /// If we already have a good snapshot, a refresh failure leaves the
  /// existing stats on screen instead of replacing them with the error
  /// surface. Silent revalidation is better UX for a stats panel than
  /// a flicker.
  const fetchOnce = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const s = await api.networkOnchain({ signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setStats(s);
      setErrored(false);
    } catch {
      if (ctrl.signal.aborted && abortRef.current !== ctrl) return;
      /// Only show the error surface when we have nothing to render.
      /// A failed refresh against an existing snapshot is silent, the
      /// 20s/60s heartbeat will pick up the next successful build and
      /// the user never sees a flash of "CHAIN READ FAILED".
      setStats((cur) => {
        if (!cur) setErrored(true);
        return cur;
      });
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    fetchOnce();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchOnce]);

  /// While we have a good snapshot, refresh every 60s (matching the backend
  /// cache TTL). While we don't, back off to a faster 20s heartbeat so a
  /// transient RPC blip self-heals without the user touching anything.
  useEffect(() => {
    const everyMs = stats ? 60_000 : 20_000;
    const id = setInterval(fetchOnce, everyMs);
    return () => clearInterval(id);
  }, [stats, fetchOnce]);

  const fundedUsdc = numericUsdc(stats?.volumes.fundedUsdc);
  const releasedUsdc = numericUsdc(stats?.volumes.releasedUsdc);
  const feesUsdc = numericUsdc(stats?.volumes.feesCollectedUsdc);
  const vaultDepositsUsdc = numericUsdc(stats?.volumes.vaultDepositsUsdc);
  const loading = !stats;
  const slides = [
    {
      id: 'activity',
      label: t.chart.activityEyebrow,
      content: (
        <DailyAreaChart
          series={stats?.series ?? null}
          loading={!stats && !errored}
          errored={errored}
          onRetry={fetchOnce}
        />
      ),
    },
    {
      id: 'status',
      label: t.tiles.escrowsFunded.label,
      content: (
        <ProofMetricGrid>
          <ProofMetric
            label={t.tiles.escrowsFunded.label}
            value={stats?.totals.escrowsFunded ?? 0}
            hint={t.tiles.escrowsFunded.hint}
            loading={loading}
          />
          <ProofMetric
            label={t.tiles.settledInFull.label}
            value={stats?.totals.escrowsSettled ?? 0}
            hint={t.tiles.settledInFull.hint}
            loading={loading}
          />
          <ProofMetric
            label={t.tiles.disputesOpened.label}
            value={stats?.totals.escrowsDisputed ?? 0}
            hint={t.tiles.disputesOpened.hint}
            loading={loading}
          />
        </ProofMetricGrid>
      ),
    },
    {
      id: 'volume',
      label: t.tiles.usdcFunded.label,
      content: (
        <ProofMetricGrid>
          <ProofMetric
            label={t.tiles.usdcFunded.label}
            value={fundedUsdc}
            decimals={2}
            unit="USDC"
            hint={t.tiles.usdcFunded.hint}
            loading={loading}
          />
          <ProofMetric
            label={t.tiles.usdcReleased.label}
            value={releasedUsdc}
            decimals={2}
            unit="USDC"
            hint={t.tiles.usdcReleased.hint}
            loading={loading}
          />
          <ProofMetric
            label={t.tiles.vaultDeposits.label}
            value={vaultDepositsUsdc}
            decimals={2}
            unit="USDC"
            hint={t.tiles.vaultDeposits.hint}
            loading={loading}
          />
        </ProofMetricGrid>
      ),
    },
    {
      id: 'records',
      label: t.smallStats.reputationRecords,
      content: (
        <ProofMetricGrid compact>
          <ProofMetric
            label={t.smallStats.milestoneReleases}
            value={stats?.totals.milestoneReleases ?? 0}
            loading={loading}
          />
          <ProofMetric
            label={t.smallStats.reputationRecords}
            value={stats?.totals.reputationRecords ?? 0}
            loading={loading}
          />
          <ProofMetric
            label={t.smallStats.yieldPayouts}
            value={stats?.totals.yieldClaims ?? 0}
            loading={loading}
          />
          <ProofMetric
            label={t.smallStats.feesCollected}
            value={feesUsdc}
            decimals={2}
            unit="USDC"
            loading={loading}
          />
        </ProofMetricGrid>
      ),
    },
  ];

  return (
    <Band tone="dark">
      <div className="grid items-center gap-8 md:min-h-[360px] lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-14">
        <div className="max-w-[46ch]">
          <SectionTag tone="dark" dot="live">
            {t.sectionTag}
          </SectionTag>
          <HeroHeadline as="h2" className="text-[clamp(2rem,4.6vw,3.75rem)]">
            {t.headlinePrefix}<Accent>{t.headlineAccent}</Accent>.
          </HeroHeadline>
          {stats && (
            <p className="mt-7 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-workspace-faint)] tabular-nums">
              {t.blockPrefix} {fmtBlock(stats.fromBlock)} → {fmtBlock(stats.toBlock)}
            </p>
          )}
        </div>
        <div data-guide="home-activity" className="min-w-0">
          <RotatingDataPanel label={t.sectionTag} slides={slides} intervalMs={6800} />
        </div>
      </div>
    </Band>
  );
}

interface DailyAreaChartProps {
  series: NetworkOnchainDayPoint[] | null;
  loading: boolean;
  errored: boolean;
  onRetry?: () => void;
}

/// Pure-SVG area chart. Three layered series (Funded, Settled, Disputes
/// + Refunds combined). Renders gridlines, a y-axis max marker, and a couple
/// of x-axis day markers so the eye has anchors without clutter. A hover
/// layer reads the cursor x and surfaces a day-detail card so a reader can
/// pull exact counts without us crowding the chart with labels.
/// Series colours, validated rather than chosen by eye.
///
/// Checked with the dataviz validator against the dark chart surface: all three
/// sit inside the OKLCH lightness band for dark mode, clear the chroma floor,
/// and hold contrast. The previous set failed twice over. Its lime was too
/// light for the surface, and its "funded" grey had almost no chroma at all, so
/// it read as an absence of colour rather than as a series.
///
/// The worst adjacent pair lands at CVD deltaE 6.6, inside the floor band that
/// is only legal with a secondary encoding. The bar gaps and the legend below
/// are that encoding; do not remove either without re-running the validator.
const SERIES = {
  funded: '#4C86C7',
  settled: '#7CA22C',
  bad: '#C05C2C',
} as const;

function DailyAreaChart({ series, loading, errored, onRetry }: DailyAreaChartProps) {
  const t = useTranslations().onChainProof.chart;
  const VIEW_W = 1000;
  const VIEW_H = 220;
  const PAD = { top: 28, right: 16, bottom: 28, left: 16 };
  const chartW = VIEW_W - PAD.left - PAD.right;
  const chartH = VIEW_H - PAD.top - PAD.bottom;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { funded, settled, badEvents, maxY } = useMemo(() => {
    if (!series || series.length === 0) {
      return { funded: [], settled: [], badEvents: [], maxY: 0 };
    }
    const funded = series.map((p) => p.funded);
    const settled = series.map((p) => p.settled);
    const badEvents = series.map((p) => p.disputed + p.refunded);
    const max = Math.max(...funded, ...settled, ...badEvents, 1);
    return { funded, settled, badEvents, maxY: max };
  }, [series]);

  if (loading) {
    return (
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{
          height: 220,
          background: 'var(--lp-workspace-soft)',
          border: '1px solid var(--lp-workspace-border)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-workspace-faint)] animate-pulse">
          {t.loading}
        </p>
      </div>
    );
  }

  if (errored || !series || series.length === 0) {
    return (
      <div
        className="relative overflow-hidden flex flex-col items-center justify-center gap-3"
        style={{
          height: 220,
          background: 'var(--lp-workspace-soft)',
          border: '1px solid var(--lp-workspace-border)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-workspace-faint)]">
          {errored ? t.error : t.empty}
        </p>
        {errored && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mono text-[10px] uppercase tracking-[0.18em] px-4 py-2 border border-[var(--lp-workspace-border)] text-[var(--lp-workspace-muted)] hover:text-[var(--lp-workspace-ink)] hover:border-[var(--lp-workspace-ink)] transition-colors"
            style={{ borderRadius: 999 }}
          >
            {t.retry}
          </button>
        )}
      </div>
    );
  }

  const n = series.length;
  const yFor = (v: number) =>
    PAD.top + chartH - (v / Math.max(1, maxY)) * chartH;

  /// Converts a pointer's client x into the nearest data index. Reads the
  /// SVG's rendered bounds at event time so the math survives any container
  /// resize. The +PAD.left offset accounts for the chart's inset from the
  /// SVG edge.
  function indexFromClientX(clientX: number, svg: SVGSVGElement): number {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const xView = ((clientX - rect.left) / rect.width) * VIEW_W;
    // Floor into the slot the pointer is over, not round to the nearest
    // vertex: a bar owns a band of x, not a point on one.
    const raw = Math.floor((xView - PAD.left) / Math.max(1, chartW / Math.max(1, n)));
    return Math.max(0, Math.min(n - 1, raw));
  }

  function onPointerMove(e: React.MouseEvent<SVGSVGElement>) {
    setHoverIdx(indexFromClientX(e.clientX, e.currentTarget));
  }

  function onTouchPick(e: React.TouchEvent<SVGSVGElement>) {
    const t = e.touches[0];
    if (!t) return;
    setHoverIdx(indexFromClientX(t.clientX, e.currentTarget));
  }

  /// Grouped-bar geometry.
  ///
  /// Each day owns a slot; the three series sit side by side inside it with a
  /// gap between them. The gap is not decoration: the palette's worst adjacent
  /// pair sits in the 6-8 CVD band, which is only legal alongside a secondary
  /// encoding, and separated marks plus the legend are that encoding.
  const slotW = chartW / Math.max(1, n);
  const GROUP_PAD = 0.22; // share of the slot left empty either side
  const barsW = slotW * (1 - GROUP_PAD * 2);
  const barW = Math.max(1.5, barsW / 3 - 1.5);
  const slotX = (i: number) => PAD.left + i * slotW;
  /// Middle of a day's slot. Labels and the tooltip anchor here rather than at
  /// the plot edges: spreading the first and last day flush to the edges is
  /// line-chart geometry, and against bars it drifted every label by half a
  /// slot so none sat under its own column.
  const slotMid = (i: number) => slotX(i) + slotW / 2;
  const barX = (i: number, sIdx: number) =>
    slotX(i) + slotW * GROUP_PAD + sIdx * (barW + 1.5);

  /// A count of zero draws nothing. A 1px stub for "no activity" reads as
  /// activity at a glance, and most days here are genuinely empty.
  function Bars({ values, fill, sIdx }: { values: number[]; fill: string; sIdx: number }) {
    return (
      <>
        {values.map((v, i) => {
          if (v <= 0) return null;
          const y = yFor(v);
          const h = PAD.top + chartH - y;
          return (
            <rect
              key={`${sIdx}-${i}`}
              x={barX(i, sIdx)}
              y={y}
              width={barW}
              height={h}
              rx={Math.min(2, barW / 2)}
              fill={fill}
            />
          );
        })}
      </>
    );
  }

  // Day markers: first, middle, last (compact, fast to read).
  const xMarkers = [0, Math.floor(n / 2), n - 1];

  return (
    <figure>
      <div
        dir="ltr"
        className="relative overflow-hidden"
        style={{
          background: 'var(--lp-workspace-soft)',
          border: '1px solid var(--lp-workspace-border)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-workspace-faint)]">
            [:{t.activityEyebrow}:]
          </p>
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-workspace-muted)] tabular-nums">
            {t.maxPerDay.replace('{max}', String(maxY))}
          </p>
        </div>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block w-full h-auto"
          onMouseMove={onPointerMove}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchStart={onTouchPick}
          onTouchMove={onTouchPick}
          onTouchEnd={() => setHoverIdx(null)}
          style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
        >
          <defs>
            <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--lp-workspace-border)" />
              <stop offset="100%" stopColor="var(--lp-workspace-soft)" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines at quartiles. */}
          {[0, 0.25, 0.5, 0.75, 1].map((q) => {
            const y = PAD.top + chartH * q;
            return (
              <line
                key={`grid-${q}`}
                x1={PAD.left}
                x2={PAD.left + chartW}
                y1={y}
                y2={y}
                stroke="url(#gridFade)"
                strokeWidth={1}
              />
            );
          })}

          {/* Three series, side by side, one bar per day.

              This was two filled areas with straight lines drawn between the
              daily points and a dot layer on top. Every part of that was
              telling a small lie about the data: these are discrete counts of
              events, capped around four a day and zero on most days, and a
              line between Tuesday's 4 and Thursday's 0 draws a Wednesday that
              never happened. The fills then occluded each other wherever both
              series moved, so the series in front decided what you could see.

              Bars say what the numbers are: a day either had events or it did
              not, and the height is the count rather than a vertex on a slope. */}
          <Bars values={funded} fill={SERIES.funded} sIdx={0} />
          <Bars values={settled} fill={SERIES.settled} sIdx={1} />
          <Bars values={badEvents} fill={SERIES.bad} sIdx={2} />

          {/* X-axis day markers (first / mid / last). */}
          {xMarkers.map((i) => {
            const point = series[i];
            return (
              <text
                key={`xm-${i}`}
                x={slotMid(i)}
                y={VIEW_H - 8}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fill="var(--lp-workspace-faint)"
                fontSize={10}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                letterSpacing="0.12em"
              >
                {formatDayLabel(point.ts)}
              </text>
            );
          })}

          {/* Hover guide + per-series dots at the active day. */}
          {hoverIdx !== null && (
            <g pointerEvents="none">
              <rect
                x={slotX(hoverIdx)}
                y={PAD.top}
                width={slotW}
                height={chartH}
                fill="var(--lp-workspace-grid)"
              />
            </g>
          )}
        </svg>

        {/* HTML tooltip card with the exact day breakdown. Positioned in
            percent so it scales with the SVG and flips left near the right
            edge so the right-most day (today) reads without clipping. */}
        {hoverIdx !== null && (
          <HoverTooltip
            point={series[hoverIdx]}
            xPct={(slotMid(hoverIdx) / VIEW_W) * 100}
          />
        )}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <LegendDot color={SERIES.funded} label={t.legend.funded} />
        <LegendDot color={SERIES.settled} label={t.legend.settled} />
        <LegendDot color={SERIES.bad} label={t.legend.disputedOrRefunded} />
      </figcaption>
    </figure>
  );
}

/// Floating card surfaced on hover. Flips to the cursor's left when the
/// reader is near the right edge so the tooltip can't clip out of the
/// container. `pointer-events: none` keeps it from stealing mouse events
/// from the SVG underneath, so the cursor can keep tracking.
function HoverTooltip({ point, xPct }: { point: NetworkOnchainDayPoint; xPct: number }) {
  const t = useTranslations().onChainProof.chart.tooltip;
  const flipLeft = xPct > 72;
  const bad = point.disputed + point.refunded;
  return (
    <div
      role="tooltip"
      className="absolute pointer-events-none px-3 py-2.5"
      style={{
        top: 36,
        left: `${xPct}%`,
        transform: flipLeft ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
        background: 'rgba(14,14,14,0.96)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
        boxShadow: '0 4px 18px rgba(0,0,0,0.55)',
        minWidth: 156,
        zIndex: 2,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-workspace-muted)]">
        {formatTooltipDate(point.ts)}
      </p>
      <div className="mt-2 space-y-1.5">
        <TipRow color={SERIES.funded} label={t.funded} value={point.funded} />
        <TipRow color={SERIES.settled} label={t.settled} value={point.settled} />
        {bad > 0 && <TipRow color={SERIES.bad} label={t.disputedRefunded} value={bad} />}
      </div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block w-2 h-2 shrink-0"
        style={{ background: color, borderRadius: 1 }}
      />
      <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-workspace-muted)] flex-1">
        {label}
      </span>
      <span className="font-sans text-[13px] font-extrabold tabular-nums text-[var(--lp-workspace-ink)]">
        {value}
      </span>
    </div>
  );
}

function formatTooltipDate(tsMs: number): string {
  const d = new Date(tsMs);
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()];
  return `${month} ${d.getUTCDate()} · ${d.getUTCFullYear()}`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block w-2.5 h-2.5"
        style={{ background: color, borderRadius: 1 }}
      />
      <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-workspace-muted)]">
        {label}
      </span>
    </span>
  );
}

function ProofMetricGrid({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? 'grid grid-cols-2 gap-px bg-[var(--lp-workspace-border)]'
          : 'grid grid-cols-2 gap-px bg-[var(--lp-workspace-border)] [&>*:last-child]:col-span-2 sm:grid-cols-3 sm:[&>*:last-child]:col-span-1'
      }
    >
      {children}
    </div>
  );
}

function ProofMetric({
  label,
  value,
  decimals = 0,
  unit,
  hint,
  loading,
}: {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="min-w-0 bg-[var(--lp-workspace-raised)] p-3 sm:p-4">
      <p className="mono text-[8px] uppercase leading-relaxed tracking-[0.12em] text-[var(--lp-workspace-muted)] sm:text-[9px]">
        {label}
      </p>
      {loading ? (
        <div className="mt-3 h-8 w-16 bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse" aria-hidden />
      ) : (
        <p className="mt-2 flex min-w-0 flex-wrap items-baseline gap-1 font-sans text-[clamp(1.45rem,4vw,2.5rem)] font-extrabold leading-none tracking-[-0.035em] text-[var(--lp-workspace-ink)] tabular-nums">
          <span className="min-w-0 max-w-full">
            <AnimatedNumber value={value} decimals={decimals} />
          </span>
          {unit && <span className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--lp-workspace-faint)]">{unit}</span>}
        </p>
      )}
      {hint && <p className="mt-2 hidden text-[10px] leading-relaxed text-[var(--lp-workspace-faint)] sm:block">{hint}</p>}
    </div>
  );
}

function fmtBlock(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-US');
}

function numericUsdc(raw?: string): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatDayLabel(tsMs: number): string {
  const d = new Date(tsMs);
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()];
  return `${month} ${d.getUTCDate()}`;
}
