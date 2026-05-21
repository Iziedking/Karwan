'use client';
import { useEffect, useState } from 'react';
import { useReputation } from '../hooks/useReputation';

type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';

const TIER_COLOR: Record<Tier, string> = {
  NEW: 'var(--color-ink-faint)',
  COLD: 'var(--color-warning)',
  ESTABLISHED: 'var(--color-accent)',
  STRONG: 'var(--color-positive)',
  ELITE: '#0E5E3E',
};

const TIER_BLURB: Record<Tier, string> = {
  NEW: 'Welcome aboard.',
  COLD: 'Your track record is taking shape.',
  ESTABLISHED: 'A solid, trusted profile.',
  STRONG: 'A preferred counterparty. Agents move faster for you.',
  ELITE: 'Top tier. Agents accept first-look within range, no auction.',
};

/// One-shot congrats banner shown on the profile when the user crosses into a
/// higher reputation tier. The backend opens a 48h window (tierCelebration);
/// this renders within it and can be dismissed early. Self-contained: pass the
/// user's address and it reads its own reputation.
export function TierCelebration({ address }: { address?: string | null }) {
  const { data } = useReputation(address);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const celebration = data?.tierCelebration;
  if (!celebration || dismissed || celebration.until <= now) return null;

  const tier = celebration.tier as Tier;
  const color = TIER_COLOR[tier];

  return (
    <div
      className="relative mb-6 overflow-hidden border bg-[var(--color-surface)] fade-up"
      style={{
        borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: color }} />
      <div className="flex items-center gap-4 px-5 py-4 pl-6">
        <span
          aria-hidden
          className="hidden sm:inline-flex items-center justify-center shrink-0 w-12 h-12 rounded-xl font-sans font-extrabold text-[18px]"
          style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
        >
          {tier[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="mono text-[10px] uppercase tracking-[0.18em]" style={{ color }}>
            [:TIER UP:]
          </p>
          <p className="mt-1 font-sans text-[18px] font-extrabold tracking-[-0.01em] text-[var(--color-ink)]">
            You reached{' '}
            <span style={{ color }}>{tier}</span>
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-ink-dim)]">
            {TIER_BLURB[tier]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
