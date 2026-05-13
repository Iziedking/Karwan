'use client';
import { useEffect, useState } from 'react';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

const STAGE_BY_EVENT: Record<string, 0 | 1 | 2 | 3 | 4> = {
  'job.tracked': 0,
  'bid.submitted': 1,
  'counter.issued': 2,
  'counter.response.submitted': 2,
  'bid.accepted': 3,
  'escrow.approved': 3,
  'escrow.funded': 4,
  'escrow.milestone.released': 4,
  'escrow.settled': 4,
};

const stageLabel = ['Brief posted', 'Bids in', 'Negotiating', 'Accepted', 'Settling'] as const;

export function HeroFlow() {
  const events = useLiveEvents(undefined, 30);
  const latestStage =
    events.find((e) => STAGE_BY_EVENT[e.type] !== undefined && STAGE_BY_EVENT[e.type] !== null)?.type;
  const stage = latestStage != null ? STAGE_BY_EVENT[latestStage] : null;
  const idle = stage === null || stage === undefined;

  // Cycle through stages when idle to give the visual life
  const [demoStage, setDemoStage] = useState<0 | 1 | 2 | 3 | 4>(0);
  useEffect(() => {
    if (!idle) return;
    const t = setInterval(() => setDemoStage((s) => ((s + 1) % 5) as typeof s), 2400);
    return () => clearInterval(t);
  }, [idle]);

  const shown = idle ? demoStage : (stage as 0 | 1 | 2 | 3 | 4);

  return (
    <div className="relative rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 overflow-hidden">
      <svg width="100%" height="200" viewBox="0 0 360 200" className="block">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1b3a5b" stopOpacity="0.1" />
            <stop offset="0.5" stopColor="#1b3a5b" stopOpacity="0.45" />
            <stop offset="1" stopColor="#1b3a5b" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <line x1="60" y1="100" x2="300" y2="100" stroke="var(--color-line-strong)" strokeWidth="1" />
        <line x1="60" y1="100" x2="300" y2="100" stroke="url(#lineGrad)" strokeWidth="2" />

        <Node x={60} label="Buyer" sublabel="agent" active={shown >= 0} variant="left" />
        <Node x={300} label="Seller" sublabel="agent" active={shown >= 1} variant="right" />

        {/* Animated USDC token traveling */}
        <g className={`token token-${shown}`}>
          <circle r="9" fill="#fff" stroke="#1b3a5b" strokeWidth="1.5" />
          <text textAnchor="middle" y="3.5" fontSize="8" fontWeight="600" fill="#1b3a5b" fontFamily="var(--font-geist-mono, monospace)">$</text>
        </g>

        {/* Stage labels under the line */}
        <g fontSize="9.5" fill="#6b6f76" fontFamily="var(--font-geist, sans-serif)" textAnchor="middle">
          <text x="105" y="128">brief</text>
          <text x="160" y="128">bid</text>
          <text x="215" y="128">counter</text>
          <text x="270" y="128">accept</text>
        </g>

        {/* Escrow / settle nodes below */}
        <line x1="180" y1="135" x2="180" y2="158" stroke="var(--color-line-strong)" strokeWidth="1" />
        <g transform="translate(180 168)">
          <rect x="-58" y="-12" width="116" height="24" rx="6" fill="#fff" stroke={shown >= 4 ? '#0f5132' : 'var(--color-line-strong)'} strokeWidth="1" />
          <text textAnchor="middle" y="4.5" fontSize="11" fontWeight="600" fill={shown >= 4 ? '#0f5132' : '#6b6f76'}>
            {shown >= 4 ? 'Escrow · settling' : 'Escrow'}
          </text>
        </g>
      </svg>

      <div className="absolute top-4 left-6 flex items-center gap-2 text-[11px] text-[var(--color-ink-faint)]">
        <span className={`w-1.5 h-1.5 rounded-full ${idle ? 'bg-[var(--color-ink-faint)]' : 'bg-[var(--color-positive)] pulse-soft'}`} />
        <span>{idle ? 'awaiting activity' : stageLabel[shown]}</span>
      </div>

      <style>{`
        .token {
          transform: translate(60px, 100px);
          transition: transform 1100ms cubic-bezier(.4,.0,.2,1);
        }
        .token-0 { transform: translate(60px, 100px); }
        .token-1 { transform: translate(180px, 100px); }
        .token-2 { transform: translate(220px, 100px); }
        .token-3 { transform: translate(300px, 100px); }
        .token-4 { transform: translate(180px, 168px); }
        @keyframes pulse-soft {
          0%, 100% { box-shadow: 0 0 0 0 rgba(15, 81, 50, 0.5); }
          50% { box-shadow: 0 0 0 6px rgba(15, 81, 50, 0); }
        }
        .pulse-soft { animation: pulse-soft 1.6s ease-out infinite; }
      `}</style>
    </div>
  );
}

function Node({
  x,
  label,
  sublabel,
  active,
  variant,
}: {
  x: number;
  label: string;
  sublabel: string;
  active: boolean;
  variant: 'left' | 'right';
}) {
  const color = active ? '#0c0e10' : '#9a9da3';
  const labelX = variant === 'left' ? x - 26 : x + 26;
  const labelAnchor = variant === 'left' ? 'end' : 'start';
  return (
    <g>
      <circle cx={x} cy={100} r="14" fill="#fff" stroke={color} strokeWidth="1.5" />
      {variant === 'left' ? (
        <g transform={`translate(${x - 6} 94)`} stroke={color} fill="none" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="6" cy="3" r="2.5" />
          <path d="M0.5 12c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        </g>
      ) : (
        <g transform={`translate(${x - 6} 94)`} stroke={color} fill="none" strokeWidth="1.5" strokeLinecap="round">
          <rect x="0" y="3" width="12" height="9" rx="1" />
          <path d="M3 3V2c0-.8.7-1.5 1.5-1.5h3c.8 0 1.5.7 1.5 1.5V3" />
        </g>
      )}
      <text
        x={labelX}
        y={97}
        textAnchor={labelAnchor}
        fontSize="12"
        fontWeight="600"
        fill="#0c0e10"
        fontFamily="var(--font-geist, sans-serif)"
      >
        {label}
      </text>
      <text
        x={labelX}
        y={110}
        textAnchor={labelAnchor}
        fontSize="9.5"
        fill="#9a9da3"
        fontFamily="var(--font-geist, sans-serif)"
      >
        {sublabel}
      </text>
    </g>
  );
}
