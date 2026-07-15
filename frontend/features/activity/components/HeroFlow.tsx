'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Dark-native palette. This visual sits on the landing hero which is always
/// dark, so it does not read the themeable --color-* tokens.
const CARD_BG = '#151515';
const STROKE = 'rgba(255,255,255,0.16)';
const ACCENT = '#AFC95B';
const INK_ACTIVE = '#ededed';
const SUB = '#8a8a90';

/// Three-station loop: Buyer agent → Escrow → Seller agent. The coin pauses
/// briefly at each station, then continues. The line between stations is
/// drawn in the deal-flow direction so the eye reads buyer-to-escrow-to-seller
/// without needing labels for that part of the motion.
const PATH = [
  { x: 60, y: 100, label: 'BUYER' },   // 0 → Buyer agent
  { x: 180, y: 148, label: 'ESCROW' }, // 1 → rests on the drop-line just ABOVE
                                       //     the pill, never over its label
  { x: 300, y: 100, label: 'SELLER' }, // 2 → Seller agent
] as const;

const STAGE_DURATION = 1.6; // seconds the coin holds at each station
const TRAVEL_DURATION = 0.9; // seconds in transit between stations

export function HeroFlow() {
  const t = useTranslations().heroFlow;
  // Cycle: 0 → 1 → 2 → 0 → 1 → 2 → ...
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const id = setInterval(
      () => setStage((s) => (((s + 1) % PATH.length) as 0 | 1 | 2)),
      (TRAVEL_DURATION + STAGE_DURATION) * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const pos = PATH[stage];
  const atEscrow = stage === 1;
  const atSeller = stage === 2;

  return (
    <div
      className="relative rounded-2xl border p-6 overflow-hidden"
      style={{ background: CARD_BG, borderColor: STROKE }}
    >
      <svg width="100%" height="220" viewBox="0 0 360 200" className="block">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.15" />
            <stop offset="0.5" stopColor={ACCENT} stopOpacity="0.7" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="coinGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.55" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Top horizontal line between Buyer and Seller. */}
        <line x1="60" y1="100" x2="300" y2="100" stroke={STROKE} strokeWidth="1" />
        <line x1="60" y1="100" x2="300" y2="100" stroke="url(#lineGrad)" strokeWidth="2" />

        {/* Drop line connecting the top track to the Escrow pill. */}
        <line x1="180" y1="100" x2="180" y2="165" stroke={STROKE} strokeWidth="1" />

        <Node
          x={60}
          label={t.nodes.buyerLabel}
          sublabel={t.nodes.agentSublabel}
          active={stage === 0}
          variant="left"
        />
        <Node
          x={300}
          label={t.nodes.sellerLabel}
          sublabel={t.nodes.agentSublabel}
          active={atSeller}
          variant="right"
        />

        {/* Stage labels on the top track. */}
        <g fontSize="9.5" fill={SUB} fontFamily="var(--font-geist, sans-serif)" textAnchor="middle">
          <text x="105" y="128">{t.stages.request}</text>
          <text x="160" y="128">{t.stages.bid}</text>
          <text x="215" y="128">{t.stages.counter}</text>
          <text x="270" y="128">{t.stages.accept}</text>
        </g>

        {/* Escrow pill, lights up when the coin lands inside it. */}
        <g transform="translate(180 168)">
          <motion.rect
            x="-58"
            y="-12"
            width="116"
            height="24"
            rx="6"
            fill={CARD_BG}
            stroke={ACCENT}
            strokeWidth="1"
            animate={{
              strokeOpacity: atEscrow ? 1 : 0.35,
            }}
            transition={{ duration: 0.3 }}
          />
          <motion.text
            textAnchor="middle"
            y="4.5"
            fontSize="11"
            fontWeight="700"
            fill={ACCENT}
            animate={{ opacity: atEscrow ? 1 : 0.6 }}
            transition={{ duration: 0.3 }}
          >
            {atEscrow ? t.escrow.settling : t.escrow.idle}
          </motion.text>
        </g>

        {/* GLOW HALO trailing the coin. Slightly behind the coin in the SVG
            stack so the coin renders on top of its own glow. */}
        <motion.circle
          r="22"
          fill="url(#coinGlow)"
          animate={{ cx: pos.x, cy: pos.y }}
          transition={{ duration: TRAVEL_DURATION, ease: [0.45, 0, 0.2, 1] }}
        />

        {/* THE COIN. Lime fill, dark $ inscription. Big enough that the eye
            tracks it without trying. Drop shadow gives it a tactile lift. */}
        <motion.g
          animate={{ x: pos.x, y: pos.y }}
          transition={{ duration: TRAVEL_DURATION, ease: [0.45, 0, 0.2, 1] }}
        >
          <circle
            r="12"
            fill={ACCENT}
            stroke="rgba(14,14,14,0.18)"
            strokeWidth="1"
          />
          <circle
            r="9.5"
            fill="none"
            stroke="rgba(14,14,14,0.25)"
            strokeWidth="0.8"
          />
          <text
            textAnchor="middle"
            y="4.5"
            fontSize="13"
            fontWeight="900"
            fill="#0e0e0e"
            fontFamily="var(--font-geist-mono, monospace)"
          >
            $
          </text>
        </motion.g>
      </svg>

      {/* small caption hairline below the graphic so it reads as a flow */}
      <div
        className="mt-3 flex items-center justify-between mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: SUB }}
      >
        <span>{t.caption.buyerAgent}</span>
        <span style={{ color: ACCENT }}>{t.caption.routesThroughEscrow}</span>
        <span>{t.caption.sellerAgent}</span>
      </div>
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
  const color = INK_ACTIVE;
  const labelX = variant === 'left' ? x - 26 : x + 26;
  const labelAnchor = variant === 'left' ? 'end' : 'start';
  return (
    <g>
      {/* Pulse halo on the active node. */}
      {active && (
        <motion.circle
          cx={x}
          cy={100}
          r="14"
          fill="none"
          stroke={ACCENT}
          strokeWidth="1.2"
          initial={{ scale: 1, opacity: 0.45 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }}
          style={{ transformOrigin: `${x}px 100px` }}
        />
      )}
      <circle cx={x} cy={100} r="14" fill={CARD_BG} stroke={color} strokeWidth="1.5" />
      {variant === 'left' ? (
        <g
          transform={`translate(${x - 6} 94)`}
          stroke={color}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="6" cy="3" r="2.5" />
          <path d="M0.5 12c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        </g>
      ) : (
        <g
          transform={`translate(${x - 6} 94)`}
          stroke={color}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <rect x="0" y="3" width="12" height="9" rx="1" />
          <path d="M3 3V2c0-.8.7-1.5 1.5-1.5h3c.8 0 1.5.7 1.5 1.5V3" />
        </g>
      )}
      <text
        x={labelX}
        y={97}
        textAnchor={labelAnchor}
        fontSize="12"
        fontWeight="700"
        fill={INK_ACTIVE}
        fontFamily="var(--font-geist, sans-serif)"
      >
        {label}
      </text>
      <text
        x={labelX}
        y={110}
        textAnchor={labelAnchor}
        fontSize="9.5"
        fill={SUB}
        fontFamily="var(--font-geist, sans-serif)"
      >
        {sublabel}
      </text>
    </g>
  );
}
