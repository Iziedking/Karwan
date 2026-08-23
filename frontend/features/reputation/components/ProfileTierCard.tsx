'use client';
import { useReputation } from '../hooks/useReputation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { tierProgress, tierProgressLabel } from '../tierProgressLabel';

type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';

const ORDER: Tier[] = ['NEW', 'COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];
// Lower bound of each tier on the 0-1000 scale, plus the 1000 ceiling.
const BREAKS = [0, 200, 400, 600, 800, 1000];

// Tuned for the dark profile header (brighter than the light-mode badge hues).
const COLOR: Record<Tier, string> = {
  NEW: '#9a9a9a',
  COLD: '#e0a23c',
  ESTABLISHED: 'var(--lp-accent)',
  STRONG: '#5fd08a',
  ELITE: '#39e08a',
};

/// Persistent reputation card for the top of the profile (dark header band).
/// Shows the current tier, score / 1000, a position bar with the tier marks,
/// and how far to the next tier. Self-contained: pass the user's address.
export function ProfileTierCard({ address }: { address?: string | null }) {
  const { data, fetchState } = useReputation(address);
  const pt = useTranslations().profileTierCard;
  const tp = useTranslations().tierProgress;
  if (!address) return null;

  if (fetchState === 'loading' && !data) {
    return (
      <div
        className="fade-up fade-up-4 mt-5 w-full max-w-[440px] h-[92px] rounded-2xl border border-white/10 bg-white/[0.04] animate-pulse motion-reduce:animate-none"
        aria-hidden
      />
    );
  }

  const tier = (data?.tier ?? 'NEW') as Tier;
  const score = Math.round(data?.score ?? 0);
  const color = COLOR[tier];
  const idx = ORDER.indexOf(tier);
  /// What the next tier actually needs. `max(0, BREAKS[idx+1] - score)` read
  /// "0 to ESTABLISHED" on a wallet whose score had cleared the rung but whose
  /// tier was held down by a ceiling: the clamp turned a negative distance into
  /// a claim that it had arrived.
  const progress = tierProgress({
    score,
    tier,
    tierCappedBy: data?.tierCappedBy ?? null,
    dealsToNextTier: data?.dealsToNextTier ?? null,
  });
  const progressLabel = tierProgressLabel(progress, tp, (t) => t);
  const pct = Math.min(100, Math.max(0, (score / 1000) * 100));

  return (
    <div
      className="fade-up fade-up-4 mt-5 w-full max-w-[440px] border border-white/10 bg-white/[0.04] px-5 py-4"
      style={{ borderRadius: 16, borderBottomRightRadius: 4 }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          {pt.eyebrow}
        </span>
        <span className="mono text-[11px] tabular-nums text-white/55">
          {score}
          <span className="text-white/35"> {pt.scoreSuffix}</span>
        </span>
      </div>

      {/* The tier word never breaks. It was `min-w-0 break-words` beside a
          progress label that can run to "needs varied counterparties", so on a
          narrow phone the label squeezed it and COLD came out as COL / D. The
          label is the part that should give: it wraps, and the word does not. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span
          className="shrink-0 whitespace-nowrap font-sans text-[clamp(18px,6vw,26px)] font-extrabold uppercase tracking-[-0.02em] leading-none"
          style={{ color }}
        >
          {tier}
        </span>
        <span className="min-w-0 text-[12px] text-white/55">
          {progressLabel}
        </span>
      </div>

      {/* Position bar across the full 0-1000 scale with tier breakpoint ticks. */}
      <div className="relative mt-3 h-[6px] w-full rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="absolute start-0 top-0 bottom-0 rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
        {BREAKS.slice(1, -1).map((b) => (
          <span
            key={b}
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-[var(--lp-band-dark)]/70"
            style={{ insetInlineStart: `${(b / 1000) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
