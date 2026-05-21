'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { useReputation } from '../hooks/useReputation';

type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';

const ORDER: Tier[] = ['NEW', 'COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];

// Vivid tier hue used for FILLS only (badge, rail, confetti, rank squares). The
// tier word and labels never use the raw hue. lime-family hues fail contrast on
// light, so text renders in a darkened mix of the hue instead.
const TIER_HUE: Record<Tier, string> = {
  NEW: '#9a9a9a',
  COLD: '#e0a23c',
  ESTABLISHED: 'var(--lp-accent)',
  STRONG: '#37c87f',
  ELITE: '#16b06a',
};

const TIER_BLURB: Record<Tier, string> = {
  NEW: 'Welcome aboard.',
  COLD: 'Your track record is taking shape.',
  ESTABLISHED: 'A solid, trusted profile.',
  STRONG: 'A preferred counterparty. Agents move faster for you.',
  ELITE: 'Top tier. Agents accept first look within range, no auction.',
};

// Allow inline CSS custom properties (--rail-dy etc.) without fighting the types.
type Styleable = CSSProperties & Record<string, string | number>;

// Deterministic burst layout. Hand-tuned spreads so it reads as designed, not
// random. role resolves to a brand colour at render time.
type Role = 'lime' | 'tier' | 'dark';
const RAILS = Array.from({ length: 9 }, (_, i) => ({
  left: 6 + i * 10.5,
  w: 3 + (i % 3),
  h: 44 + ((i * 37) % 90),
  role: (['lime', 'tier', 'dark'] as Role[])[i % 3],
  delay: (i * 47) % 420,
  dur: 1750 + ((i * 90) % 420),
  dy: 56 + ((i * 11) % 30),
}));
const CHIPS = Array.from({ length: 18 }, (_, i) => ({
  left: 3 + i * 5.3,
  size: 6 + (i % 4),
  role: (['lime', 'tier', 'dark', 'lime'] as Role[])[i % 4],
  delay: 60 + ((i * 71) % 700),
  dur: 1950 + ((i * 110) % 600),
  dy: 64 + ((i * 13) % 22),
  dx: ((i * 53) % 90) - 45,
  rot: 150 + ((i * 97) % 200),
}));

function hueFor(role: Role, tierHue: string): string {
  return role === 'lime' ? 'var(--lp-accent)' : role === 'dark' ? '#0e0e0e' : tierHue;
}

/// Full-viewport, pointer-safe celebration layer. Brand rails drop from the top,
/// square confetti tumbles after. Decorative, aria-hidden, auto-removed by the
/// parent after ~9s. Suppressed entirely under prefers-reduced-motion.
function TierBurst({ tierHue }: { tierHue: string }) {
  return (
    <div
      aria-hidden
      className="tier-burst pointer-events-none fixed inset-x-0 top-0 z-[60] h-[88vh] overflow-hidden"
    >
      {RAILS.map((r, i) => (
        <span
          key={`r${i}`}
          className="tier-rail absolute top-0 block"
          style={
            {
              left: `${r.left}%`,
              width: r.w,
              height: r.h,
              background: hueFor(r.role, tierHue),
              borderRadius: 1,
              '--rail-dy': `${r.dy}vh`,
              '--rail-delay': `${r.delay}ms`,
              '--rail-dur': `${r.dur}ms`,
            } as Styleable
          }
        />
      ))}
      {CHIPS.map((c, i) => (
        <span
          key={`c${i}`}
          className="tier-chip absolute top-0 block"
          style={
            {
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              background: hueFor(c.role, tierHue),
              borderRadius: 1,
              '--chip-dy': `${c.dy}vh`,
              '--chip-dx': `${c.dx}px`,
              '--chip-delay': `${c.delay}ms`,
              '--chip-dur': `${c.dur}ms`,
              '--chip-rot': `${c.rot}deg`,
            } as Styleable
          }
        />
      ))}
    </div>
  );
}

/// Milestone banner shown on the profile when the user crosses into a higher
/// reputation tier. The backend opens a 48h window (tierCelebration); the card
/// renders within it and can be dismissed early. The big confetti drop fires
/// once per celebration window (localStorage-gated) so it doesn't re-rain on
/// every visit; the card itself still pops in each time. Pass the user's
/// address and it reads its own reputation.
export function TierCelebration({ address }: { address?: string | null }) {
  const { data } = useReputation(address);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const celebration = data?.tierCelebration;
  const tier = (celebration?.tier ?? 'NEW') as Tier;
  const until = celebration?.until ?? 0;
  // A dismissal sticks for this exact window (tier + until) so closing the card
  // keeps it closed across refreshes. A later tier-up carries a new `until`, so
  // it still celebrates. Read synchronously to avoid a flash of the card before
  // an effect could hide it.
  const dismissKey =
    celebration && address ? `karwan:tierdismiss:${address.toLowerCase()}:${tier}:${until}` : null;
  const storedDismissed =
    !!dismissKey && typeof window !== 'undefined' && !!window.localStorage.getItem(dismissKey);
  const active = !!celebration && !dismissed && !storedDismissed && celebration.until > now;

  // Big sky-drop plays once per celebration window per wallet.
  useEffect(() => {
    if (!active || !address || typeof window === 'undefined') return;
    const key = `karwan:tierburst:${address.toLowerCase()}:${tier}:${until}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, String(Date.now()));
    setShowBurst(true);
    const t = setTimeout(() => setShowBurst(false), 9000);
    return () => clearTimeout(t);
  }, [active, address, tier, until]);

  if (!active) return null;

  const dismiss = () => {
    setDismissed(true);
    if (dismissKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(dismissKey, String(Date.now()));
      } catch {
        /* storage disabled; the dismissal still holds for this session */
      }
    }
  };

  const hue = TIER_HUE[tier];
  const rank = ORDER.indexOf(tier);
  const labelInk = `color-mix(in oklab, ${hue} 52%, #0a0a0b)`;
  const wordInk = `color-mix(in oklab, ${hue} 70%, #0a0a0b)`;

  return (
    <>
      {showBurst && <TierBurst tierHue={hue} />}
      <div
        role="status"
        className="celebrate-card-pop relative isolate mb-6 overflow-hidden border bg-[var(--color-surface)]"
        style={{
          borderColor: `color-mix(in oklab, ${hue} 45%, transparent)`,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 4,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* One-time shine sweep, mirrors the cardShimmer device. */}
        <span
          aria-hidden
          className="celebrate-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3"
          style={{
            background:
              'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%)',
          }}
        />
        {/* Left tone rail in the tier hue. */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 z-10 w-[5px]"
          style={{ background: hue }}
        />

        <div className="relative z-10 flex items-center gap-4 px-5 py-5 pl-6 sm:gap-5">
          <span
            aria-hidden
            className="hidden sm:inline-flex shrink-0 items-center justify-center font-sans text-[22px] font-extrabold"
            style={{
              width: 56,
              height: 56,
              background: hue,
              color: '#0e0e0e',
              borderRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            {tier[0]}
          </span>

          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.2em]" style={{ color: labelInk }}>
              [:TIER UNLOCKED:]
            </p>
            <p className="mt-1.5 font-sans text-[22px] font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
              You reached <span style={{ color: wordInk }}>{tier}</span>
              <span style={{ color: 'var(--lp-accent)' }}>.</span>
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-ink-dim)]">
              {TIER_BLURB[tier]}
            </p>
            {/* Rank ladder: filled squares up to the tier reached. */}
            <div className="mt-2.5 flex items-center gap-1.5" aria-hidden>
              {ORDER.map((t, i) => (
                <span
                  key={t}
                  className="block h-[7px] w-[7px]"
                  style={{
                    background: i <= rank ? hue : 'var(--color-ink-faint)',
                    opacity: i <= rank ? 1 : 0.3,
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-ink-faint)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
