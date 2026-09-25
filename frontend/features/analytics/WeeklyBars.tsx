'use client';
import { useEffect, useRef, useState } from 'react';
import { niceTicks } from './series';

/// One series, one bar per week. Hand-drawn SVG so the page carries no chart
/// library: thin rounded bars on a recessive grid, a tooltip on hover or focus
/// whose hit area is the whole column, and a table view for anyone who would
/// rather read numbers than bars.

export interface BarDatum {
  key: string;
  /// Axis label, already formatted.
  label: string;
  value: number;
  /// Tooltip lines, already formatted. The first is the heading.
  tooltip: string[];
}

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 44 };

export function WeeklyBars({
  data,
  axisFormat,
  title,
  tableHeaders,
  tableValue,
  showTableLabel,
  hideTableLabel,
}: {
  data: BarDatum[];
  axisFormat: (v: number) => string;
  title: string;
  tableHeaders: [string, string];
  tableValue: (d: BarDatum) => string;
  showTableLabel: string;
  hideTableLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = data.length > 0 ? plotW / data.length : plotW;
  const gap = 2;
  const barW = Math.max(2, Math.min(28, slot - gap));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 72))));

  const bar = (x: number, w: number, h: number) => {
    const r = Math.min(4, w / 2, h);
    const base = PAD.top + plotH;
    const t = base - h;
    return `M${x},${base} V${t + r} Q${x},${t} ${x + r},${t} H${x + w - r} Q${x + w},${t} ${x + w},${t + r} V${base} Z`;
  };

  const tip = active !== null ? data[active] : null;
  const tipX = active !== null ? PAD.left + slot * active + slot / 2 : 0;

  return (
    <figure className="space-y-3">
      <div ref={wrap} dir="ltr" className="relative" onMouseLeave={() => setActive(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={title} className="block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--lp-border-light)"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--lp-text-sub)] text-[11px] tabular-nums">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            const h = d.value > 0 ? Math.max(2, (d.value / top) * plotH) : 0;
            return (
              <g key={d.key}>
                {h > 0 ? (
                  <path
                    d={bar(x, barW, h)}
                    fill="var(--chart-bar)"
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text
                    x={PAD.left + slot * i + slot / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className="fill-[var(--lp-text-sub)] text-[11px]"
                  >
                    {d.label}
                  </text>
                ) : null}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={d.tooltip.join(', ')}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="cursor-default outline-none focus-visible:stroke-[var(--lp-dark)]"
                />
              </g>
            );
          })}
        </svg>
        {tip ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 min-w-[9rem] -translate-x-1/2 rounded-[10px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-[13px] shadow-[var(--shadow-pop)]"
            style={{ left: Math.min(Math.max(tipX, 80), width - 80) }}
          >
            <p className="font-semibold text-[var(--lp-dark)]">{tip.tooltip[0]}</p>
            {tip.tooltip.slice(1).map((line) => (
              <p key={line} className="tabular-nums text-[var(--lp-text-sub)]">{line}</p>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setTable((t) => !t)}
        aria-expanded={table}
        className="inline-flex min-h-11 items-center text-[13px] font-medium text-[var(--lp-text-sub)] underline-offset-4 hover:underline"
      >
        {table ? hideTableLabel : showTableLabel}
      </button>
      {table ? (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--lp-border-light)] text-start text-[var(--lp-text-sub)]">
              <th className="py-2 text-start font-medium">{tableHeaders[0]}</th>
              <th className="py-2 text-end font-medium">{tableHeaders[1]}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b border-[var(--lp-border-light)] last:border-0">
                <td className="py-2 text-[var(--lp-dark)]">{d.tooltip[0]}</td>
                <td className="py-2 text-end tabular-nums text-[var(--lp-dark)]">{tableValue(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
