'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type NetworkOnchainDayPoint, type NetworkOnchainStats } from '@/core/api';
import {
  Band,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  BigStatTile,
} from '@/shared/components/Bands';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
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

  return (
    <Band tone="dark">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[46ch]">
          <SectionTag tone="dark" dot="live">
            {t.sectionTag}
          </SectionTag>
          <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
            {t.headlinePrefix}<Accent>{t.headlineAccent}</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-pretty text-[15px] leading-relaxed text-white/65 max-w-[44ch]">
            {t.description}
          </p>
        </div>
        {stats && (
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45 tabular-nums">
            {t.blockPrefix} {fmtBlock(stats.fromBlock)} → {fmtBlock(stats.toBlock)}
          </p>
        )}
      </div>

      {/* Chart band. 30-day overlay of funded, settled, and any
          disputed/refunded blips so a quiet week reads honestly. */}
      <div className="mt-10">
        <DailyAreaChart
          series={stats?.series ?? null}
          loading={!stats && !errored}
          errored={errored}
          onRetry={fetchOnce}
        />
      </div>

      {/* Six tiles. Mix of counts and USDC so the chart sits on top of
          something concrete, not just an abstract curve. */}
      <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="fade-up fade-up-1">
          <BigStatTile
            label={t.tiles.escrowsFunded.label}
            value={<AnimatedNumber value={stats?.totals.escrowsFunded ?? 0} decimals={0} />}
            hint={t.tiles.escrowsFunded.hint}
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-2">
          <BigStatTile
            label={t.tiles.settledInFull.label}
            value={<AnimatedNumber value={stats?.totals.escrowsSettled ?? 0} decimals={0} />}
            hint={t.tiles.settledInFull.hint}
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-3">
          <BigStatTile
            label={t.tiles.disputesOpened.label}
            value={<AnimatedNumber value={stats?.totals.escrowsDisputed ?? 0} decimals={0} />}
            hint={t.tiles.disputesOpened.hint}
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-4">
          <BigStatTile
            label={t.tiles.usdcFunded.label}
            value={<AnimatedNumber value={fundedUsdc} decimals={2} />}
            unit="USDC"
            hint={t.tiles.usdcFunded.hint}
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-4">
          <BigStatTile
            label={t.tiles.usdcReleased.label}
            value={<AnimatedNumber value={releasedUsdc} decimals={2} />}
            unit="USDC"
            hint={t.tiles.usdcReleased.hint}
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-4">
          <BigStatTile
            label={t.tiles.vaultDeposits.label}
            value={<AnimatedNumber value={vaultDepositsUsdc} decimals={2} />}
            unit="USDC"
            hint={t.tiles.vaultDeposits.hint}
            loading={!stats}
          />
        </div>
      </div>

      {/* Three secondary numbers + a treasury readout, smaller scale. */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <SmallStat
          label={t.smallStats.milestoneReleases}
          value={stats?.totals.milestoneReleases ?? 0}
          loading={!stats}
        />
        <SmallStat
          label={t.smallStats.reputationRecords}
          value={stats?.totals.reputationRecords ?? 0}
          loading={!stats}
        />
        <SmallStat
          label="Yield claims"
          value={stats?.totals.yieldClaims ?? 0}
          loading={!stats}
        />
        <SmallStat
          label={t.smallStats.feesCollected}
          value={feesUsdc}
          decimals={2}
          loading={!stats}
        />
      </div>

      {/* Source contracts. Tap-friendly explorer links so a reader can verify
          which addresses we are reading. */}
      {stats && (
        <div className="mt-12 pt-6 border-t border-white/[0.08]">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            [:{t.sourceContracts.eyebrow}:]
          </p>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-6">
            <ContractRow label={t.sourceContracts.labels.escrow} address={stats.contracts.escrow} />
            <ContractRow label={t.sourceContracts.labels.vault} address={stats.contracts.vault} />
            <ContractRow label={t.sourceContracts.labels.reputation} address={stats.contracts.reputation} />
            <ContractRow label={t.sourceContracts.labels.treasury} address={stats.contracts.treasury} />
            <ContractRow label={t.sourceContracts.labels.jobBoard} address={stats.contracts.jobBoard} />
            {stats.contracts.yieldDistributor ? (
              <ContractRow
                label="Yield distributor"
                address={stats.contracts.yieldDistributor}
              />
            ) : null}
          </ul>
        </div>
      )}
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
function DailyAreaChart({ series, loading, errored, onRetry }: DailyAreaChartProps) {
  const t = useTranslations().onChainProof.chart;
  const VIEW_W = 1000;
  const VIEW_H = 280;
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
          height: 280,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45 animate-pulse">
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
          height: 280,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          {errored ? t.error : t.empty}
        </p>
        {errored && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mono text-[10px] uppercase tracking-[0.18em] px-4 py-2 border border-white/20 text-white/85 hover:text-white hover:border-white/40 transition-colors"
            style={{ borderRadius: 999 }}
          >
            {t.retry}
          </button>
        )}
      </div>
    );
  }

  const n = series.length;
  const xFor = (i: number) => PAD.left + (i * chartW) / Math.max(1, n - 1);
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
    const stride = chartW / Math.max(1, n - 1);
    const raw = Math.round((xView - PAD.left) / Math.max(1, stride));
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

  const areaPath = (values: number[]) => {
    if (values.length === 0) return '';
    const pts = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' L ');
    const start = `${xFor(0)},${PAD.top + chartH}`;
    const end = `${xFor(values.length - 1)},${PAD.top + chartH}`;
    return `M ${start} L ${pts} L ${end} Z`;
  };

  const linePath = (values: number[]) => {
    if (values.length === 0) return '';
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ');
  };

  // Day markers: first, middle, last (compact, fast to read).
  const xMarkers = [0, Math.floor(n / 2), n - 1];

  return (
    <figure>
      <div
        dir="ltr"
        className="relative overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/45">
            [:{t.activityEyebrow}:]
          </p>
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/55 tabular-nums">
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
            <linearGradient id="fundedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <linearGradient id="settledFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(175,201,91,0.38)" />
              <stop offset="100%" stopColor="rgba(175,201,91,0)" />
            </linearGradient>
            <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
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

          {/* Funded area (muted white). */}
          <path d={areaPath(funded)} fill="url(#fundedFill)" />
          <path d={linePath(funded)} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />

          {/* Settled area (lime accent). */}
          <path d={areaPath(settled)} fill="url(#settledFill)" />
          <path
            d={linePath(settled)}
            fill="none"
            stroke="var(--lp-accent, #afc95b)"
            strokeWidth={1.75}
          />

          {/* Disputes/refunds as small dots so a quiet day reads as quiet. */}
          {badEvents.map((v, i) => {
            if (v === 0) return null;
            return (
              <circle
                key={`bad-${i}`}
                cx={xFor(i)}
                cy={yFor(v)}
                r={3.5}
                fill="#c96030"
                stroke="rgba(14,14,14,0.65)"
                strokeWidth={1}
              />
            );
          })}

          {/* X-axis day markers (first / mid / last). */}
          {xMarkers.map((i) => {
            const point = series[i];
            return (
              <text
                key={`xm-${i}`}
                x={xFor(i)}
                y={VIEW_H - 8}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fill="rgba(255,255,255,0.45)"
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
              <line
                x1={xFor(hoverIdx)}
                x2={xFor(hoverIdx)}
                y1={PAD.top}
                y2={PAD.top + chartH}
                stroke="rgba(255,255,255,0.32)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(funded[hoverIdx])}
                r={4}
                fill="rgba(255,255,255,0.95)"
                stroke="rgba(14,14,14,0.85)"
                strokeWidth={1.5}
              />
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(settled[hoverIdx])}
                r={4}
                fill="var(--lp-accent, #afc95b)"
                stroke="rgba(14,14,14,0.85)"
                strokeWidth={1.5}
              />
              {badEvents[hoverIdx] > 0 && (
                <circle
                  cx={xFor(hoverIdx)}
                  cy={yFor(badEvents[hoverIdx])}
                  r={4}
                  fill="#c96030"
                  stroke="rgba(14,14,14,0.85)"
                  strokeWidth={1.5}
                />
              )}
            </g>
          )}
        </svg>

        {/* HTML tooltip card with the exact day breakdown. Positioned in
            percent so it scales with the SVG and flips left near the right
            edge so the right-most day (today) reads without clipping. */}
        {hoverIdx !== null && (
          <HoverTooltip
            point={series[hoverIdx]}
            xPct={(xFor(hoverIdx) / VIEW_W) * 100}
          />
        )}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <LegendDot color="rgba(255,255,255,0.55)" label={t.legend.funded} />
        <LegendDot color="var(--lp-accent, #afc95b)" label={t.legend.settled} />
        <LegendDot color="#c96030" label={t.legend.disputedOrRefunded} />
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
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/55">
        {formatTooltipDate(point.ts)}
      </p>
      <div className="mt-2 space-y-1.5">
        <TipRow color="rgba(255,255,255,0.85)" label={t.funded} value={point.funded} />
        <TipRow color="var(--lp-accent, #afc95b)" label={t.settled} value={point.settled} />
        {bad > 0 && (
          <TipRow color="#c96030" label={t.disputedRefunded} value={bad} />
        )}
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
      <span className="mono text-[10px] uppercase tracking-[0.1em] text-white/55 flex-1">
        {label}
      </span>
      <span className="font-sans text-[13px] font-extrabold tabular-nums text-white">
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
      <span className="mono text-[10px] uppercase tracking-[0.16em] text-white/55">
        {label}
      </span>
    </span>
  );
}

function SmallStat({
  label,
  value,
  decimals = 0,
  loading,
}: {
  label: string;
  value: number;
  decimals?: number;
  loading?: boolean;
}) {
  return (
    <div
      className="px-4 py-3"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-1.5 font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.02em] text-white">
        {loading ? '—' : <AnimatedNumber value={value} decimals={decimals} />}
      </p>
    </div>
  );
}

function ContractRow({ label, address }: { label: string; address: string }) {
  if (!address) return null;
  const explorer = process.env.NEXT_PUBLIC_ARC_EXPLORER ?? 'https://testnet.arcscan.app';
  return (
    <li className="flex items-baseline gap-3 min-w-0">
      <span className="mono text-[10px] uppercase tracking-[0.16em] text-white/45 shrink-0">
        {label}
      </span>
      <a
        href={`${explorer}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mono text-[11px] tabular-nums text-white/80 hover:text-white truncate"
      >
        {short(address)}
      </a>
    </li>
  );
}

function short(address: string): string {
  if (!address || address.length < 12) return address || '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
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
