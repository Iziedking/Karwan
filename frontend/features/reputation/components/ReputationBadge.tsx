'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useReputation } from '../hooks/useReputation';
import {
  TIER_HUE,
  TIER_LABEL,
  tierBg,
  tierBorder,
  type CompositeTier,
} from '../tierColors';

type Tier = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

// The one true tier vocabulary + palette, shared by every surface (bid cards,
// MatchBanner, profile, deal detail, peek modal) AND the /stake ladder via the
// tierColors module. NEW < COLD < ESTABLISHED < STRONG < ELITE.
function tierStyle(t: CompositeTier): Tier {
  return { label: TIER_LABEL[t], color: TIER_HUE[t], bg: tierBg(t), border: tierBorder(t) };
}
const TIER_STYLES: Record<CompositeTier, Tier> = {
  NEW: tierStyle('NEW'),
  COLD: tierStyle('COLD'),
  ESTABLISHED: tierStyle('ESTABLISHED'),
  STRONG: tierStyle('STRONG'),
  ELITE: tierStyle('ELITE'),
};

// Legacy bps badge, kept only as a fallback for API responses that predate the
// composite engine (no `tier`/`score`). New responses always carry both.
function tierFor(scoreBps: number, totalDeals: number): Tier {
  // Explicit "no data" treatment. the wallet has settled zero deals, so any
  // displayed score would be misleading. Label and color are deliberately
  // muted so it reads as "unknown" rather than "low".
  if (totalDeals === 0) {
    return {
      label: 'Unrated',
      color: 'var(--color-ink-faint)',
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Portal target only exists on the client. Gating the createPortal call on
  // this flag keeps SSR safe and avoids a hydration mismatch on first render.
  const [mounted, setMounted] = useState(false);
  // Viewport-clamped popover position. Null until computed so we render the
  // popover only after the trigger's bounding rect is known, no flash.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute the popover position from the trigger button's bounding rect,
  // clamped to the viewport so it never sits off-screen on narrow widths.
  // Re-runs on scroll and resize so the popover tracks the button. Uses
  // useLayoutEffect so the computed position lands before paint, no jump.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPos(null);
      return;
    }
    function compute() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(256, Math.max(220, window.innerWidth - margin * 2));
      let left = rect.left;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin;
      }
      if (left < margin) left = margin;
      let top = rect.bottom + 8;
      // Flip the popover above the trigger if dropping below would overflow
      // the viewport bottom (common on the seller row deep in a card on mobile).
      const estimatedHeight = 240;
      if (top + estimatedHeight > window.innerHeight - margin) {
        const above = rect.top - estimatedHeight - 8;
        if (above >= margin) top = above;
      }
      setPos({ top, left, width });
    }
    compute();
    window.addEventListener('resize', compute);
    // Capture-phase scroll listener catches scrolls in any scrollable
    // ancestor, not just the window, so a popover inside an overflowing card
    // still tracks the trigger.
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  // Close on outside click / Escape. With the popover portaled to body, an
  // "outside" click means the event target is neither the trigger nor the
  // popover element.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
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

  const cellPad = size === 'sm' ? 'px-1.5 py-[3px]' : 'px-2 py-1';
  const labelSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';
  const scoreSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]';

  if (fetchState === 'loading' || !data) {
    return (
      <span
        className="inline-flex items-stretch border border-[var(--color-line)] bg-[var(--color-surface)]"
        style={{ borderRadius: 2 }}
      >
        <span
          aria-hidden
          className="w-[3px]"
          style={{ background: 'var(--color-line-strong)' }}
        />
        <span
          className={`mono uppercase tracking-[0.18em] text-[var(--color-ink-faint)] ${cellPad} ${labelSize}`}
        >
          ·
        </span>
      </span>
    );
  }

  // Prefer the composite engine (NEW..ELITE, 0..1000). Fall back to the legacy
  // bps badge only when an older API response omits tier/score.
  const useComposite = data.tier != null && data.score != null;
  const tier = useComposite ? TIER_STYLES[data.tier!] : tierFor(data.scoreBps, data.totalDeals);
  const scoreMax = useComposite ? 1000 : 100;
  const score = useComposite ? Math.round(data.score!) : Math.round(data.scoreBps / 100);
  // Composite score is meaningful from day one (stake + time terms), so show it
  // whenever we have it; legacy bps only made sense with settled deals.
  const showScore = useComposite ? true : data.totalDeals > 0;

  return (
    <span className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={withDetail ? () => setOpen((s) => !s) : undefined}
        disabled={!withDetail}
        aria-haspopup={withDetail ? 'dialog' : undefined}
        aria-expanded={withDetail ? open : undefined}
        title={`${tier.label} · ${data.totalDeals} ${data.totalDeals === 1 ? 'deal' : 'deals'}`}
        className={`group inline-flex items-stretch border transition-colors ${
          withDetail ? 'hover:brightness-95' : 'cursor-default'
        }`}
        style={{
          borderColor: tier.border,
          background: 'var(--color-surface)',
          borderRadius: 2,
        }}
      >
        <span aria-hidden className="w-[3px]" style={{ background: tier.color }} />
        <span
          className={`flex items-center ${cellPad} mono uppercase tracking-[0.18em] font-semibold ${labelSize}`}
          style={{ color: tier.color }}
        >
          {tier.label}
        </span>
        {showScore && (
          <>
            <span
              aria-hidden
              className="w-px self-stretch"
              style={{ background: tier.border }}
            />
            <span
              className={`flex items-center ${cellPad} mono tabular-nums ${scoreSize}`}
              style={{ color: 'var(--color-ink-dim)' }}
            >
              {score}
            </span>
          </>
        )}
      </button>

      {withDetail && open && mounted && pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Reputation details"
            className="fixed z-50 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card-hover)] p-3 fade-up"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
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
                {showScore ? score : '-'}
              </span>
              <span className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                {showScore ? `/ ${scoreMax}` : 'unrated'}
              </span>
            </div>
            <div className="space-y-1.5 pt-2">
              <StatRow label="Success" value={data.successCount} tone="positive" />
              <StatRow label="Disputed" value={data.disputedCount} tone="warning" />
              <StatRow label="Failed" value={data.failedCount} tone="critical" />
            </div>
            <p className="mt-3 pt-2 border-t border-[var(--color-line)] text-[10px] text-[var(--color-ink-faint)] leading-snug">
              Composite of deal history, stake, and tenure. Recorded on-chain.
            </p>
            {address && (
              <Link
                href={`/credit-passport/${address}`}
                className="mt-2 inline-flex items-center gap-1 text-[10px] mono uppercase tracking-[0.12em] text-[var(--color-accent)] hover:underline"
              >
                Credit passport ↗
              </Link>
            )}
          </div>,
          document.body,
        )
      }
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

