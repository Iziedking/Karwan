'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/core/api';

/// Network-side yield readout. Three tiles + a cumulative accrual chart.
/// Both polls land every 30s so the chart adds a new point each day-tick
/// without hammering the RPC (backend caches at 30s too).

interface ProtocolReserves {
  totalCreditedUsdc: string;
  totalClaimedUsdc: string;
  outstandingUsdc: string;
}

interface HistoryPoint {
  day: string;
  dailyCreditedUsdc: string;
  cumulativeCreditedUsdc: string;
}

function fmt(s: string | undefined): string {
  if (!s) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function ReservesWidget() {
  const [data, setData] = useState<ProtocolReserves | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    /// Settle the two fetches independently. If `/history` 502s (Arc public
    /// RPC silently dropping a wide getLogs window), the tiles still render
    /// from `/protocol`'s view-function reads. Promise.all here used to
    /// reject and blank the entire widget.
    const fetchOnce = async () => {
      const [protocolResult, historyResult] = await Promise.allSettled([
        api.yieldProtocol(),
        api.yieldHistory(),
      ]);
      if (cancelled) return;

      if (protocolResult.status === 'fulfilled') {
        const r = protocolResult.value;
        if (!r.configured) {
          setConfigured(false);
        } else {
          setConfigured(true);
          setData({
            totalCreditedUsdc: r.totalCreditedUsdc ?? '0',
            totalClaimedUsdc: r.totalClaimedUsdc ?? '0',
            outstandingUsdc: r.outstandingUsdc ?? '0',
          });
        }
      }

      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value.history ?? []);
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (configured === false) return null;

  const tiles: Array<{ label: string; value: string; hint: string }> = [
    {
      label: 'Total distributed',
      value: fmt(data?.totalCreditedUsdc),
      hint: 'Lifetime USDC credited to stakers',
    },
    {
      label: 'Total claimed',
      value: fmt(data?.totalClaimedUsdc),
      hint: 'Withdrawn by stakers to date',
    },
    {
      label: 'Total outstanding',
      value: fmt(data?.outstandingUsdc),
      hint: 'Accrued, awaiting claim',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--lp-border-light)] bg-[var(--lp-border-light)]">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="bg-[var(--lp-card)] px-5 py-4 sm:px-6 sm:py-5"
          >
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {t.label}
            </p>
            <p className="mt-1.5 font-sans text-[24px] sm:text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[var(--lp-dark)]">
              {t.value}
              <span className="ms-1.5 text-[13px] font-semibold text-[var(--lp-text-muted)] tracking-normal">
                USDC
              </span>
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--lp-text-sub)]">
              {t.hint}
            </p>
          </div>
        ))}
      </div>

      <AccrualChart history={history} />
    </div>
  );
}

/// Lime-accented area chart. Cumulative USDC distributed on y, days on x.
/// Hand-rolled SVG; no chart-library dependency for this single surface.
function AccrualChart({ history }: { history: HistoryPoint[] }) {
  const padded = useMemo(() => {
    if (history.length === 0) return [];
    if (history.length === 1) {
      // Two-point series so we render a flat line, not nothing.
      const only = history[0];
      return [
        { ...only, day: '' },
        only,
      ];
    }
    return history;
  }, [history]);

  if (padded.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[12px] text-[var(--lp-text-muted)] rounded-2xl border border-dashed border-[var(--lp-border-light)] bg-[var(--lp-card)]"
        style={{ height: 220 }}
      >
        Distribution chart appears once the first cron tick lands.
      </div>
    );
  }

  const width = 1000;
  const height = 220;
  const padX = 28;
  const padY = 22;
  const xs = padded.map((_, i) => padX + ((width - padX * 2) * i) / Math.max(1, padded.length - 1));
  const values = padded.map((p) => Number(p.cumulativeCreditedUsdc) || 0);
  const maxV = Math.max(...values, 1);
  const ys = values.map((v) => height - padY - (v / maxV) * (height - padY * 2));

  const linePath = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${xs[xs.length - 1].toFixed(1)} ${height - padY} L ${xs[0].toFixed(1)} ${height - padY} Z`;

  /// Sparse x-labels: first, last, and every nth in between so the strip
  /// stays readable even for long series.
  const labelEvery = Math.max(1, Math.floor(padded.length / 6));
  const yGrid = 4;
  const yTicks = Array.from({ length: yGrid + 1 }, (_, i) => (maxV * i) / yGrid);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-3 sm:px-4 sm:py-4"
    >
      <div className="flex items-baseline justify-between gap-3 px-2 pb-1">
        <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
          Cumulative distribution
        </p>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-sub)]">
          USDC
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: 220 }}
        role="img"
        aria-label="Cumulative USDC distributed to stakers over time"
      >
        {/* Y grid */}
        {yTicks.map((t, i) => {
          const y = height - padY - (i / yGrid) * (height - padY * 2);
          return (
            <g key={`y${i}`}>
              <line
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="var(--lp-border-light)"
                strokeWidth="1"
              />
              <text
                x={padX - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--lp-text-muted)"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {fmt(t.toString())}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="var(--lp-accent)" opacity="0.18" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="var(--lp-accent)" strokeWidth="2" />
        {/* Endpoint dot */}
        <circle
          cx={xs[xs.length - 1]}
          cy={ys[ys.length - 1]}
          r="4"
          fill="var(--lp-accent)"
        />

        {/* X labels */}
        {padded.map((p, i) => {
          if (i !== 0 && i !== padded.length - 1 && i % labelEvery !== 0) return null;
          if (!p.day) return null;
          return (
            <text
              key={`x${i}`}
              x={xs[i]}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === padded.length - 1 ? 'end' : 'middle'}
              fontSize="10"
              fill="var(--lp-text-muted)"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {p.day.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
