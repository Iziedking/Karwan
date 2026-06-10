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
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

const EXPLORER = 'https://testnet.arcscan.app';
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

// Composite tier bands on the 0-1000 scale. MUST mirror the backend's
// TIER_BREAKPOINTS in backend/src/reputation/config.ts (NEW <200, COLD 200-399,
// ESTABLISHED 400-599, STRONG 600-799, ELITE >=800). Earlier this used a 250 /
// 450 / 650 / 850 scheme that drifted from the backend after the v2 engine
// landed, which made the "Next tier · +N" hint compute against a different
// ladder than the pill rendered against, e.g. score 407 read as ESTABLISHED
// (backend rule >=400) yet the hint said "Established · +43" (frontend rule
// >=450). The two sides MUST stay in lockstep; if you change the backend
// breakpoints, change these too.
const TIER_BANDS: { tier: CompositeTier; start: number }[] = [
  { tier: 'NEW', start: 0 },
  { tier: 'COLD', start: 200 },
  { tier: 'ESTABLISHED', start: 400 },
  { tier: 'STRONG', start: 600 },
  { tier: 'ELITE', start: 800 },
];

/// Ordered list of the composite term keys the engine returns. The visible
/// label for each comes from i18n at render time; the order here drives the
/// vertical ordering in the Score factors section.
const TERM_KEYS = ['completion', 'stake', 'volume', 'tenure', 'activity', 'referral'] as const;
type TermKey = (typeof TERM_KEYS)[number];

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export function CreditPassport({ address }: { address: string }) {
  const cp = useTranslations().creditPassport;
  const valid = ADDR_RE.test(address);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stakeUsdc, setStakeUsdc] = useState<string>('0');
  const [stakeSynced, setStakeSynced] = useState<boolean>(true);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [copied, setCopied] = useState(false);
  /// SME public profile (companyName, sector, region, ...) + computed
  /// repaymentBehavior. Renders a separate band so the passport stays
  /// useful for service users too.
  const [sme, setSme] = useState<{
    smeProfile: NonNullable<UserProfile['smeProfile']> | null;
    repaymentBehavior: {
      windowDealCount: number;
      onTimeRate: number;
      averageDaysToSettle: number;
      defaultCount: number;
    } | null;
  } | null>(null);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    let pollId: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      const [repRes, profRes, vaultRes, smeRes] = await Promise.allSettled([
        api.reputation(address),
        api.getProfile(address),
        api.vaultPositions(address),
        // The SME profile only matters when the trade rail is live; skip
        // the call otherwise.
        SME_TRADES_ENABLED ? api.getSmeProfile(address) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (smeRes.status === 'fulfilled' && smeRes.value) {
        setSme({
          smeProfile: (smeRes.value.smeProfile ?? null) as
            | NonNullable<UserProfile['smeProfile']>
            | null,
          repaymentBehavior: smeRes.value.repaymentBehavior,
        });
      }
      // Reputation is the load-bearing read; if it fails the passport can't render.
      if (repRes.status !== 'fulfilled') {
        setFetchState('error');
        return;
      }
      setRep(repRes.value);
      setProfile(profRes.status === 'fulfilled' ? profRes.value.profile : null);
      if (vaultRes.status === 'fulfilled') {
        setStakeUsdc(vaultRes.value.totalActiveUsdc);
        // synced is optional on the response for back-compat with older
        // backends. undefined means "we don't know, assume final".
        const synced = vaultRes.value.synced !== false;
        setStakeSynced(synced);
        // Mid-scan: poll the vault endpoint until it reports synced, so the
        // total catches up without the user manually refreshing. Reputation
        // is left as the first read since it depends on chain mirroring,
        // not the vault scan.
        if (!synced) {
          pollId = setTimeout(async () => {
            try {
              const next = await api.vaultPositions(address);
              if (cancelled) return;
              setStakeUsdc(next.totalActiveUsdc);
              const nextSynced = next.synced !== false;
              setStakeSynced(nextSynced);
              if (!nextSynced) {
                // Same effect, recurse via the load() guarantee that pollId
                // only ever holds the latest scheduled timer.
                pollId = setTimeout(load, 5000);
              }
            } catch {
              /* transient; the next user-driven refresh will catch up */
            }
          }, 5000);
        }
      } else {
        setStakeUsdc('0');
        setStakeSynced(true);
      }
      setFetchState('ready');
    }

    setFetchState('loading');
    void load();

    return () => {
      cancelled = true;
      if (pollId) clearTimeout(pollId);
    };
  }, [address, valid]);

  if (!valid) {
    return (
      <Shell>
        <p className="eyebrow">{cp.eyebrow}</p>
        <h1 className="mt-2 text-[28px] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
          {cp.invalid.headline}
        </h1>
        <p className="mt-3 text-[14px] text-[var(--color-ink-dim)]">{cp.invalid.body}</p>
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
        <p className="eyebrow">{cp.eyebrow}</p>
        <h1 className="mt-2 text-[28px] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
          {cp.error.headline}
        </h1>
        <p className="mt-3 text-[14px] text-[var(--color-ink-dim)]">
          {cp.error.bodyTemplate.replace('{address}', shortAddress(address))}
        </p>
      </Shell>
    );
  }

  const tier: CompositeTier = rep.tier ?? 'NEW';
  const score = Math.round(rep.score ?? 0);
  const total = rep.totalDeals;
  const hue = TIER_HUE[tier];

  const terms = rep.terms ?? {};
  const termRows = TERM_KEYS.map((key) => ({
    label: cp.factors.labels[key as TermKey],
    value: (terms as Record<string, number | undefined>)[key],
  })).filter((r): r is { label: string; value: number } => typeof r.value === 'number');

  // Distance to the next tier ladder rung. Drives the "next tier +X" hint
  // on the score panel so a viewer knows what reaching the next badge would
  // take. Null at ELITE (no higher rung).
  const nextTierTarget = TIER_BANDS.find((b) => b.start > score);
  const distanceToNext = nextTierTarget ? nextTierTarget.start - score : null;

  // Tenure in days. Pulled from the registration timestamp the engine uses for
  // the tenure factor. Surfaced as a stat so viewers see how long this wallet
  // has been on Karwan, useful context for a passport someone is sharing.
  const registeredAt = rep.inputs?.registeredAt;
  const tenureDays =
    registeredAt && registeredAt > 0
      ? Math.max(0, Math.floor((Date.now() - registeredAt) / 86_400_000))
      : null;

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
          <p className="eyebrow">{cp.eyebrow}</p>
          <h1
            className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)] tracking-tight leading-[1.05]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {profile?.displayName || cp.fallbackName}
          </h1>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={copyAddress}
              title={cp.copyAddressTitle}
              className="inline-flex items-center gap-1.5 mono text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
            >
              {shortAddress(address)}
              <span className="text-[10px] text-[var(--color-ink-faint)]">
                {copied ? cp.copyAddressDone : cp.copyAddressIdle}
              </span>
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

      {/* SCORE PANEL: score + tier ladder + next-tier hint, all in one card so
          the number, the tier, and what it would take to climb sit together
          instead of as three separate isolated panels. */}
      <section
        className="mt-8 rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
      >
        <div className="p-6 md:p-7">
          <div className="flex items-end gap-4 flex-wrap">
            <span
              className="text-[72px] md:text-[88px] leading-[0.85] tabular-nums tracking-[-0.02em]"
              style={{ fontFamily: 'var(--font-serif)', color: hue }}
            >
              {score}
            </span>
            <div className="pb-1">
              <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                {cp.scorePanel.compositeScore}
              </p>
              <p className="mt-0.5 mono text-[11px] text-[var(--color-ink-dim)] tabular-nums">
                {cp.scorePanel.outOfTotal}
              </p>
            </div>
            {distanceToNext != null && nextTierTarget && (
              <div className="ms-auto pb-1 text-end">
                <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                  {cp.scorePanel.nextTier}
                </p>
                <p
                  className="mt-0.5 mono text-[12px] tabular-nums"
                  style={{ color: TIER_HUE[nextTierTarget.tier] }}
                >
                  {cp.scorePanel.nextTierTemplate
                    .replace('{tier}', TIER_LABEL[nextTierTarget.tier])
                    .replace('{delta}', String(distanceToNext))}
                </p>
              </div>
            )}
          </div>
          <ScoreBand score={score} tier={tier} />
        </div>
      </section>

      {/* TRADE RECORD: four stats in one row: the three on-chain outcome
          counters plus active stake. This replaces the two-row layout that
          duplicated outcome data (Settled / Success rate / Dispute rate on
          top, Success / Disputed / Failed below) with one tighter strip. */}
      <section
        className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-px rounded-xl overflow-hidden border"
        style={{ borderColor: 'var(--color-line)', background: 'var(--color-line)' }}
      >
        <Stat
          label={cp.stats.success}
          value={String(rep.successCount)}
          tone={rep.successCount > 0 ? 'positive' : undefined}
          syncingCopy={cp.stats.syncing}
          syncingTitle={cp.stats.syncingTitle}
        />
        <Stat
          label={cp.stats.disputed}
          value={String(rep.disputedCount)}
          tone={rep.disputedCount > 0 ? 'warning' : undefined}
          syncingCopy={cp.stats.syncing}
          syncingTitle={cp.stats.syncingTitle}
        />
        <Stat
          label={cp.stats.failed}
          value={String(rep.failedCount)}
          tone={rep.failedCount > 0 ? 'critical' : undefined}
          syncingCopy={cp.stats.syncing}
          syncingTitle={cp.stats.syncingTitle}
        />
        <Stat
          label={cp.stats.activeStake}
          value={`${trimUsdc(stakeUsdc)} USDC`}
          syncing={!stakeSynced}
          syncingCopy={cp.stats.syncing}
          syncingTitle={cp.stats.syncingTitle}
        />
      </section>

      {/* META: settled total + tenure days, lower-weight than the trade
          record. Separates the headline outcome counters from the supporting
          metadata so the eye lands on outcomes first. */}
      <section className="mt-4 flex items-center justify-between gap-3 flex-wrap text-[12px] text-[var(--color-ink-dim)] px-1">
        <span>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] me-1.5">
            {cp.meta.settled}
          </span>
          <span className="tabular-nums">{total}</span>
        </span>
        {tenureDays != null && (
          <span>
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] me-1.5">
              {cp.meta.tenure}
            </span>
            <span className="tabular-nums">
              {tenureDays}
              {cp.meta.tenureDaysSuffix}
            </span>
          </span>
        )}
      </section>

      {/* SCORE FACTORS: each row reads as data, not decoration: explicit
          numerator/denominator, percent fill matches numerator, label sits
          left of value so the eye scans down the column of values cleanly. */}
      {termRows.length > 0 && (
        <section
          className="mt-5 rounded-xl border p-6"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="eyebrow">{cp.factors.eyebrow}</p>
            <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
              {cp.factors.scaleCaption}
            </p>
          </div>
          <div className="mt-4 space-y-3.5">
            {termRows.map((r) => (
              <TermBar key={r.label} label={r.label} value={r.value} hue={hue} />
            ))}
          </div>
        </section>
      )}

      {/* SME COMPANY + REPAYMENT. Part of the SME Trades rail; hidden until
          launch. Renders only when the wallet has an SME profile or
          repayment history. */}
      {SME_TRADES_ENABLED && <SmePassportBand sme={sme} />}

      {/* FOOTER */}
      <footer className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-[var(--color-ink-faint)] leading-snug max-w-[48ch]">
          {cp.footer.disclaimer}
        </p>
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
        >
          {cp.footer.verifiedLink}
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
          className="absolute inset-y-0 start-0 rounded-full"
          style={{ width: `${pct}%`, background: TIER_HUE[tier] }}
        />
        {TIER_BANDS.slice(1).map((b) => (
          <span
            key={b.tier}
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 w-px h-3"
            style={{ insetInlineStart: `${(b.start / 1000) * 100}%`, background: 'var(--color-line-strong)' }}
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
  syncing,
  syncingCopy,
  syncingTitle,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'warning' | 'critical';
  /// True while the underlying read is mid-flight, the value is provisional
  /// and may still rise. Renders a small "syncing" chip next to the label so
  /// readers don't take a partial total as final.
  syncing?: boolean;
  syncingCopy: string;
  syncingTitle: string;
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
      <div className="flex items-center gap-1.5">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">{label}</p>
        {syncing && (
          <span
            className="mono text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full"
            style={{
              color: 'var(--color-ink-faint)',
              background: 'var(--color-surface-2)',
            }}
            title={syncingTitle}
          >
            {syncingCopy}
          </span>
        )}
      </div>
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

/// SME company + repayment behavior surface. Top-level component (per
/// Vercel `rerender-no-inline-components`) so it doesn't reallocate on
/// every CreditPassport render. Renders nothing when the wallet has no
/// SME profile and no settled deals, service-flow passport readers see
/// the page exactly as before.
function SmePassportBand({
  sme,
}: {
  sme: {
    smeProfile: NonNullable<UserProfile['smeProfile']> | null;
    repaymentBehavior: {
      windowDealCount: number;
      onTimeRate: number;
      averageDaysToSettle: number;
      defaultCount: number;
    } | null;
  } | null;
}) {
  if (!sme) return null;
  const p = sme.smeProfile;
  const r = sme.repaymentBehavior;
  const hasProfile = !!p && (p.companyName || p.sector || p.region || p.websiteUrl);
  const hasRepay = !!r && r.windowDealCount > 0;
  if (!hasProfile && !hasRepay) return null;
  return (
    <section
      className="mt-8 rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-line)' }}>
        <p className="eyebrow">[:COMPANY:]</p>
      </div>
      <div className="p-6 md:p-7 grid md:grid-cols-2 gap-6">
        {hasProfile ? (
          <div className="space-y-3.5">
            {p!.companyName ? (
              <p className="text-[18px] font-extrabold leading-tight" style={{ color: 'var(--color-ink)' }}>
                {p!.companyName}
                {p!.verifiedAt ? (
                  <span className="ms-2 mono text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 align-middle" style={{ background: 'var(--color-accent)', color: 'var(--color-ink)' }}>
                    VERIFIED
                  </span>
                ) : null}
              </p>
            ) : null}
            <dl className="space-y-2">
              {p!.sector ? <PassportRow label="Sector" value={p!.sector} capitalize /> : null}
              {p!.region ? <PassportRow label="Region" value={p!.region} /> : null}
              {p!.yearFounded ? <PassportRow label="Founded" value={String(p!.yearFounded)} /> : null}
              {p!.employeeBand ? <PassportRow label="Size" value={p!.employeeBand} capitalize /> : null}
              {p!.websiteUrl ? (
                <PassportRow
                  label="Website"
                  value={
                    <a
                      href={p!.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-accent)' }}
                      className="hover:underline"
                    >
                      {p!.websiteUrl.replace(/^https?:\/\//, '')}
                    </a>
                  }
                />
              ) : null}
            </dl>
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--color-ink-dim)' }}>
            No company profile published.
          </p>
        )}
        {hasRepay ? (
          <div className="space-y-3.5">
            <p className="mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--color-ink-faint)' }}>
              [:REPAYMENT BEHAVIOR:]
            </p>
            <p className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-ink-faint)' }}>
              last {r!.windowDealCount} deals
            </p>
            <dl className="mt-2 space-y-3.5">
              <PassportStat
                label="On-time rate"
                value={`${Math.round(r!.onTimeRate * 100)}%`}
                tone={r!.onTimeRate >= 0.8 ? 'positive' : r!.onTimeRate >= 0.5 ? 'neutral' : 'critical'}
              />
              <PassportStat
                label="Avg days to settle"
                value={r!.averageDaysToSettle.toFixed(1)}
                tone="neutral"
              />
              <PassportStat
                label="Defaults"
                value={String(r!.defaultCount)}
                tone={r!.defaultCount === 0 ? 'positive' : 'critical'}
              />
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PassportRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: React.ReactNode;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-ink-faint)' }}>
        {label}
      </dt>
      <dd
        className={`text-[13px] text-right ${capitalize ? 'capitalize' : ''}`}
        style={{ color: 'var(--color-ink)' }}
      >
        {value}
      </dd>
    </div>
  );
}

function PassportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'neutral' | 'critical';
}) {
  const color =
    tone === 'positive'
      ? 'var(--color-accent)'
      : tone === 'critical'
        ? 'var(--color-danger, #b03d3a)'
        : 'var(--color-ink)';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-ink-faint)' }}>
        {label}
      </dt>
      <dd className="text-[18px] tabular-nums font-extrabold" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}
