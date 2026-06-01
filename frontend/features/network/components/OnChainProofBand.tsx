'use client';
import { useEffect, useMemo, useState } from 'react';
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

/// Home-page band that surfaces stats read directly from current-contract
/// events. Every count and volume below comes from a public chain read; the
/// caption at the bottom names the block window and the contract addresses
/// scanned so anyone can verify.
export function OnChainProofBand() {
  const [stats, setStats] = useState<NetworkOnchainStats | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .networkOnchain()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fundedUsdc = numericUsdc(stats?.volumes.fundedUsdc);
  const releasedUsdc = numericUsdc(stats?.volumes.releasedUsdc);
  const feesUsdc = numericUsdc(stats?.volumes.feesCollectedUsdc);
  const vaultDepositsUsdc = numericUsdc(stats?.volumes.vaultDepositsUsdc);

  return (
    <Band tone="dark">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[46ch]">
          <SectionTag tone="dark" dot="live">
            ON-CHAIN PROOF
          </SectionTag>
          <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)]">
            Provable on <Accent>Arc</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-pretty text-[15px] leading-relaxed text-white/65 max-w-[44ch]">
            Numbers below are read straight from the current contract events.
            Past contract generations are not aggregated; only what the active
            deployment has done counts here.
          </p>
        </div>
        {stats && (
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45 tabular-nums">
            Block {fmtBlock(stats.fromBlock)} → {fmtBlock(stats.toBlock)}
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
        />
      </div>

      {/* Six tiles. Mix of counts and USDC so the chart sits on top of
          something concrete, not just an abstract curve. */}
      <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="fade-up fade-up-1">
          <BigStatTile
            label="Escrows funded"
            value={<AnimatedNumber value={stats?.totals.escrowsFunded ?? 0} decimals={0} />}
            hint="Deals locked on chain"
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-2">
          <BigStatTile
            label="Settled in full"
            value={<AnimatedNumber value={stats?.totals.escrowsSettled ?? 0} decimals={0} />}
            hint="Buyer released, contract zeroed"
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-3">
          <BigStatTile
            label="Disputes opened"
            value={<AnimatedNumber value={stats?.totals.escrowsDisputed ?? 0} decimals={0} />}
            hint="Either side raised the contract"
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-4">
          <BigStatTile
            label="USDC funded"
            value={<AnimatedNumber value={fundedUsdc} decimals={2} />}
            unit="USDC"
            hint="Cumulative deal volume"
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-4">
          <BigStatTile
            label="USDC released"
            value={<AnimatedNumber value={releasedUsdc} decimals={2} />}
            unit="USDC"
            hint="Milestones paid to sellers"
            loading={!stats}
          />
        </div>
        <div className="fade-up fade-up-4">
          <BigStatTile
            label="Vault deposits"
            value={<AnimatedNumber value={vaultDepositsUsdc} decimals={2} />}
            unit="USDC"
            hint="Stake principal across positions"
            loading={!stats}
          />
        </div>
      </div>

      {/* Three secondary numbers + a treasury readout, smaller scale. */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <SmallStat
          label="Milestone releases"
          value={stats?.totals.milestoneReleases ?? 0}
          loading={!stats}
        />
        <SmallStat
          label="Reputation records"
          value={stats?.totals.reputationRecords ?? 0}
          loading={!stats}
        />
        <SmallStat
          label="Vault claims"
          value={stats?.totals.vaultClaims ?? 0}
          loading={!stats}
        />
        <SmallStat
          label="Fees collected (USDC)"
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
            [:SOURCE CONTRACTS:]
          </p>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-6">
            <ContractRow label="Escrow" address={stats.contracts.escrow} />
            <ContractRow label="Vault" address={stats.contracts.vault} />
            <ContractRow label="Reputation" address={stats.contracts.reputation} />
            <ContractRow label="Treasury" address={stats.contracts.treasury} />
            <ContractRow label="JobBoard" address={stats.contracts.jobBoard} />
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
}

/// Pure-SVG area chart. Three layered series (Funded, Settled, Disputes
/// + Refunds combined). Renders gridlines, a y-axis max marker, and a couple
/// of x-axis day markers so the eye has anchors without clutter.
function DailyAreaChart({ series, loading, errored }: DailyAreaChartProps) {
  const VIEW_W = 1000;
  const VIEW_H = 280;
  const PAD = { top: 16, right: 16, bottom: 28, left: 16 };
  const chartW = VIEW_W - PAD.left - PAD.right;
  const chartH = VIEW_H - PAD.top - PAD.bottom;

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
          Reading chain
        </p>
      </div>
    );
  }

  if (errored || !series || series.length === 0) {
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
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          {errored ? 'Chain read failed' : 'No activity in the last 30 days yet'}
        </p>
      </div>
    );
  }

  const n = series.length;
  const xFor = (i: number) => PAD.left + (i * chartW) / Math.max(1, n - 1);
  const yFor = (v: number) =>
    PAD.top + chartH - (v / Math.max(1, maxY)) * chartH;

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

  // Day markers — first, middle, last (compact, fast to read).
  const xMarkers = [0, Math.floor(n / 2), n - 1];

  return (
    <figure>
      <div
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
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full h-auto">
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

          {/* Y-axis max marker. Reads "max N / day" with the bigger of the
              series, so the chart anchors to a real number. */}
          <text
            x={PAD.left + chartW}
            y={PAD.top + 12}
            textAnchor="end"
            fill="rgba(255,255,255,0.45)"
            fontSize={10}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            letterSpacing="0.12em"
          >
            MAX {maxY} / DAY
          </text>

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
        </svg>
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <LegendDot color="rgba(255,255,255,0.55)" label="Funded" />
        <LegendDot color="var(--lp-accent, #afc95b)" label="Settled" />
        <LegendDot color="#c96030" label="Disputed or refunded" />
      </figcaption>
    </figure>
  );
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
