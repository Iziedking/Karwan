'use client';
import { useEffect, useRef, useState } from 'react';
import type { Reputation } from '@/core/api';
import { useReputation } from '../hooks/useReputation';

type Tier = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

function tierFor(scoreBps: number, totalDeals: number): Tier {
  if (totalDeals === 0) {
    return {
      label: 'New',
      color: 'var(--color-ink-dim)',
      bg: 'var(--color-surface-2)',
      border: 'var(--color-line)',
    };
  }
  const score = scoreBps / 100;
  if (score >= 90) {
    return {
      label: 'Top tier',
      color: '#0E5E3E',
      bg: 'color-mix(in oklab, #0E5E3E 8%, transparent)',
      border: 'color-mix(in oklab, #0E5E3E 30%, transparent)',
    };
  }
  if (score >= 70) {
    return {
      label: 'Veteran',
      color: 'var(--color-positive)',
      bg: 'var(--color-positive-soft)',
      border: 'color-mix(in oklab, var(--color-positive) 28%, transparent)',
    };
  }
  if (score >= 50) {
    return {
      label: 'Trusted',
      color: 'var(--color-accent)',
      bg: 'var(--color-accent-soft)',
      border: 'color-mix(in oklab, var(--color-accent) 28%, transparent)',
    };
  }
  if (score >= 30) {
    return {
      label: 'Cautious',
      color: 'var(--color-warning)',
      bg: 'var(--color-warning-soft)',
      border: 'color-mix(in oklab, var(--color-warning) 28%, transparent)',
    };
  }
  return {
    label: 'Watchlist',
    color: 'var(--color-critical)',
    bg: 'var(--color-critical-soft)',
    border: 'color-mix(in oklab, var(--color-critical) 28%, transparent)',
  };
}

export function ReputationBadge({
  address,
  size = 'sm',
  withDetail = false,
}: {
  address?: string;
  size?: 'sm' | 'md';
  withDetail?: boolean;
}) {
  const { data, fetchState } = useReputation(address);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Close popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!address || fetchState === 'error') {
    return null;
  }

  if (fetchState === 'loading' || !data) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] ${
          size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
        } text-[var(--color-ink-faint)]`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-line-strong)] animate-pulse" />
        <span>—</span>
      </span>
    );
  }

  const tier = tierFor(data.scoreBps, data.totalDeals);
  const score = Math.round(data.scoreBps / 100);

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={withDetail ? () => setOpen((s) => !s) : undefined}
        disabled={!withDetail}
        title={`${tier.label} · ${data.totalDeals} ${data.totalDeals === 1 ? 'deal' : 'deals'}`}
        className={`group inline-flex items-center gap-1.5 rounded-full font-medium tracking-tight transition-colors ${
          size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
        } ${withDetail ? 'hover:brightness-95' : 'cursor-default'}`}
        style={{
          background: tier.bg,
          color: tier.color,
          border: `1px solid ${tier.border}`,
        }}
      >
        <ShieldGlyph size={size === 'sm' ? 9 : 10} />
        <span>{tier.label}</span>
        {data.totalDeals > 0 && (
          <span
            className="mono tabular-nums"
            style={{ fontSize: size === 'sm' ? 9 : 10, opacity: 0.75 }}
          >
            {score}
          </span>
        )}
      </button>

      {withDetail && open && (
        <div
          className="absolute left-0 mt-2 z-30 w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card-hover)] p-3 fade-up"
        >
          <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-[var(--color-line)]">
            <span className="eyebrow">Reputation</span>
            <span className="text-[10px] mono text-[var(--color-ink-faint)]">
              {data.totalDeals} {data.totalDeals === 1 ? 'deal' : 'deals'}
            </span>
          </div>
          <div className="pt-3 pb-2 flex items-baseline gap-3">
            <span
              className="text-[36px] tracking-tight tabular-nums leading-none"
              style={{ fontFamily: 'var(--font-serif)', color: tier.color }}
            >
              {data.totalDeals === 0 ? '—' : score}
            </span>
            <span className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
              {data.totalDeals === 0 ? 'unrated' : '/ 100'}
            </span>
          </div>
          <div className="space-y-1.5 pt-2">
            <StatRow label="Success" value={data.successCount} tone="positive" />
            <StatRow label="Disputed" value={data.disputedCount} tone="warning" />
            <StatRow label="Failed" value={data.failedCount} tone="critical" />
          </div>
          <p className="mt-3 pt-2 border-t border-[var(--color-line)] text-[10px] text-[var(--color-ink-faint)] leading-snug">
            Recorded on-chain per ERC-8004. The counterparty rates after a deal settles.
          </p>
        </div>
      )}
    </span>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'warning' | 'critical';
}) {
  const color =
    tone === 'positive'
      ? 'var(--color-positive)'
      : tone === 'warning'
      ? 'var(--color-warning)'
      : 'var(--color-critical)';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-dim)]">
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="text-[12px] mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ShieldGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2L3 4v4c0 3 2 5 5 6 3-1 5-3 5-6V4l-5-2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
