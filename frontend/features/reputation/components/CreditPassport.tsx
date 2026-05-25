'use client';
import { useEffect, useState } from 'react';
import { api, type Reputation, type UserProfile } from '@/core/api';
import {
  TIER_HUE,
  TIER_LABEL,
  tierBg,
  tierBorder,
  type CompositeTier,
} from '@/features/reputation/tierColors';
import { shortAddress } from '@/shared/utils/format';

const EXPLORER = 'https://testnet.arcscan.app';
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

// Composite tier bands on the 0-1000 scale (docs/reputation-model.md): NEW <250,
// COLD 250-449, ESTABLISHED 450-649, STRONG 650-849, ELITE >=850.
const TIER_BANDS: { tier: CompositeTier; start: number }[] = [
  { tier: 'NEW', start: 0 },
  { tier: 'COLD', start: 250 },
  { tier: 'ESTABLISHED', start: 450 },
  { tier: 'STRONG', start: 650 },
  { tier: 'ELITE', start: 850 },
];

// Human labels for the composite term breakdown the engine returns (all [0,1]).
const TERM_LABELS: Record<string, string> = {
  completion: 'Completion',
  stake: 'Stake',
  volume: 'Volume',
  tenure: 'Tenure',
  activity: 'Activity',
  referral: 'Referral',
};

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export function CreditPassport({ address }: { address: string }) {
  const valid = ADDR_RE.test(address);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stakeUsdc, setStakeUsdc] = useState<string>('0');
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setFetchState('loading');
    Promise.allSettled([
      api.reputation(address),
      api.getProfile(address),
      api.vaultPositions(address),
    ])
      .then(([repRes, profRes, vaultRes]) => {
        if (cancelled) return;
        // Reputation is the load-bearing read; if it fails the passport can't render.
        if (repRes.status !== 'fulfilled') {
          setFetchState('error');
          return;
        }
        setRep(repRes.value);
        setProfile(profRes.status === 'fulfilled' ? profRes.value.profile : null);
        setStakeUsdc(vaultRes.status === 'fulfilled' ? vaultRes.value.totalActiveUsdc : '0');
        setFetchState('ready');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address, valid]);

  if (!valid) {
    return (
      <Shell>
        <p className="eyebrow">Credit passport</p>
        <h1 className="mt-2 text-[28px] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
          Invalid address
        </h1>
        <p className="mt-3 text-[14px] text-[var(--color-ink-dim)]">
          A passport URL needs a full wallet address, like /credit-passport/0x1234…abcd.
        </p>
      </Shell>
    );
  }

  if (fetchState === 'loading' || fetchState === 'idle') {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-3 w-32 rounded bg-[var(--color-surface-2)] animate-pulse motion-reduce:animate-none" />
          <div className="h-10 w-72 rounded bg-[var(--color-surface-2)] animate-pulse motion-reduce:animate-none" />
          <div className="h-40 rounded bg-[var(--color-surface-2)] animate-pulse motion-reduce:animate-none" />
        </div>
      </Shell>
    );
  }

  if (fetchState === 'error' || !rep) {
    return (
      <Shell>
        <p className="eyebrow">Credit passport</p>
        <h1 className="mt-2 text-[28px] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
          Could not load this passport
        </h1>
        <p className="mt-3 text-[14px] text-[var(--color-ink-dim)]">
          The on-chain record for {shortAddress(address)} is unavailable right now. Try again in a moment.
        </p>
      </Shell>
    );
  }

  const tier: CompositeTier = rep.tier ?? 'NEW';
  const score = Math.round(rep.score ?? 0);
  const total = rep.totalDeals;
  const successRate = total > 0 ? Math.round((rep.successCount / total) * 100) : null;
  const disputeRate = total > 0 ? Math.round((rep.disputedCount / total) * 100) : null;
  const hue = TIER_HUE[tier];

  const terms = rep.terms ?? {};
  const termRows = Object.entries(TERM_LABELS)
    .map(([key, label]) => ({ label, value: (terms as Record<string, number | undefined>)[key] }))
    .filter((r): r is { label: string; value: number } => typeof r.value === 'number');

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; no-op */
    }
  }

  return (
    <Shell>
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="eyebrow">Credit passport</p>
          <h1
            className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)] tracking-tight leading-[1.05]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {profile?.displayName || 'Karwan wallet'}
          </h1>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={copyAddress}
              title="Copy address"
              className="inline-flex items-center gap-1.5 mono text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
            >
              {shortAddress(address)}
              <span className="text-[10px] text-[var(--color-ink-faint)]">{copied ? 'copied' : 'copy'}</span>
            </button>
            {profile?.xHandle && (
              <a
                href={`https://x.com/${profile.xHandle.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-[12px] text-[var(--color-accent)] hover:underline"
              >
                @{profile.xHandle.replace(/^@/, '')}
              </a>
            )}
          </div>
        </div>
        <TierPill tier={tier} />
      </div>

      {/* SCORE + BAND */}
      <section
        className="mt-8 rounded-xl border p-6"
        style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-baseline gap-3">
          <span
            className="text-[64px] leading-none tabular-nums tracking-tight"
            style={{ fontFamily: 'var(--font-serif)', color: hue }}
          >
            {score}
          </span>
          <span className="mono text-[13px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            / 1000
          </span>
        </div>
        <ScoreBand score={score} tier={tier} />
      </section>

      {/* STATS */}
      <section className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-px rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-line)', background: 'var(--color-line)' }}>
        <Stat label="Settled deals" value={String(total)} />
        <Stat label="Success rate" value={successRate === null ? '—' : `${successRate}%`} tone="positive" />
        <Stat label="Dispute rate" value={disputeRate === null ? '—' : `${disputeRate}%`} tone={disputeRate && disputeRate > 0 ? 'warning' : undefined} />
        <Stat label="Active stake" value={`${trimUsdc(stakeUsdc)} USDC`} />
      </section>

      {/* OUTCOME BREAKDOWN */}
      <section className="mt-5 grid grid-cols-3 gap-px rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-line)', background: 'var(--color-line)' }}>
        <Stat label="Success" value={String(rep.successCount)} tone="positive" />
        <Stat label="Disputed" value={String(rep.disputedCount)} tone="warning" />
        <Stat label="Failed" value={String(rep.failedCount)} tone="critical" />
      </section>

      {/* TERM BREAKDOWN */}
      {termRows.length > 0 && (
        <section
          className="mt-5 rounded-xl border p-6"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
        >
          <p className="eyebrow">Score factors</p>
          <div className="mt-4 space-y-3">
            {termRows.map((r) => (
              <TermBar key={r.label} label={r.label} value={r.value} hue={hue} />
            ))}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-[var(--color-ink-faint)] leading-snug max-w-[48ch]">
          Composite of deal history, stake, and tenure. Reputation is recorded on Arc and travels with the wallet across deals.
        </p>
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
        >
          Verified on Arc ↗
        </a>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[70vh] px-5 py-12 md:py-16">
      <div className="mx-auto w-full max-w-[680px]">{children}</div>
    </main>
  );
}

function TierPill({ tier }: { tier: CompositeTier }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border mono text-[12px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: TIER_HUE[tier], background: tierBg(tier), borderColor: tierBorder(tier) }}
    >
      <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: TIER_HUE[tier] }} />
      {TIER_LABEL[tier]}
    </span>
  );
}

/// 0-1000 bar with the tier-band boundaries marked and the score positioned.
function ScoreBand({ score, tier }: { score: number; tier: CompositeTier }) {
  const pct = Math.max(0, Math.min(100, (score / 1000) * 100));
  return (
    <div className="mt-5">
      <div className="relative h-2 rounded-full" style={{ background: 'var(--color-surface-2)' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: TIER_HUE[tier] }}
        />
        {TIER_BANDS.slice(1).map((b) => (
          <span
            key={b.tier}
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 w-px h-3"
            style={{ left: `${(b.start / 1000) * 100}%`, background: 'var(--color-line-strong)' }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {TIER_BANDS.map((b) => (
          <span key={b.tier}>{TIER_LABEL[b.tier]}</span>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'warning' | 'critical';
}) {
  const color =
    tone === 'positive'
      ? 'var(--color-positive)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'critical'
          ? 'var(--color-critical)'
          : 'var(--color-ink)';
  return (
    <div className="p-4" style={{ background: 'var(--color-surface)' }}>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">{label}</p>
      <p className="mt-1.5 text-[22px] tabular-nums tracking-tight" style={{ fontFamily: 'var(--font-serif)', color }}>
        {value}
      </p>
    </div>
  );
}

function TermBar({ label, value, hue }: { label: string; value: number; hue: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[var(--color-ink-dim)]">{label}</span>
        <span className="mono text-[11px] tabular-nums text-[var(--color-ink-faint)]">{Math.round(pct)}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-surface-2)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hue }} />
      </div>
    </div>
  );
}

/// Drop trailing zeros from a USDC string: "200.200000" -> "200.2", "50.00" -> "50".
function trimUsdc(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, '');
}
