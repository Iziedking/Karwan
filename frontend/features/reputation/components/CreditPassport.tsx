'use client';
import { useEffect, useState } from 'react';
import { api, type Reputation, type UserProfile } from '@/core/api';
import {
  TIER_HUE,
  TIER_LABEL,
  type CompositeTier,
} from '@/features/reputation/tierColors';
import { shortAddress } from '@/shared/utils/format';
import { skillDateLabel, skillLabel } from '../skillCredentials';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { BackButton } from '@/shared/components/BackButton';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import { WalletAvatar } from '@/shared/components/WalletAvatar';

const EXPLORER = 'https://testnet.arcscan.app';
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const TIER_LADDER: CompositeTier[] = ['NEW', 'COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];

/// Ordered list of the composite term keys the engine returns. The visible
/// label for each comes from i18n at render time; the order here drives the
/// vertical ordering in the Score factors section.
const TERM_KEYS = ['completion', 'breadth', 'stake', 'volume', 'tenure', 'activity', 'referral'] as const;
type TermKey = (typeof TERM_KEYS)[number];

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export function CreditPassport({ address }: { address: string }) {
  const t = useTranslations();
  const cp = t.creditPassport;
  const { locale } = useLocale();
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
      financingsTaken?: number;
      financingsRepaid?: number;
      financingsDefaulted?: number;
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


  // Tenure in days. Pulled from the registration timestamp the engine uses for
  // the tenure factor. Surfaced as a stat so viewers see how long this wallet
  // has been on Karwan, useful context for a passport someone is sharing.
  const registeredAt = rep.inputs?.registeredAt;
  const tenureDays =
    registeredAt && registeredAt > 0
      ? Math.max(0, Math.floor((Date.now() - registeredAt) / 86_400_000))
      : null;

  /// Verified skills as the public profile reports them. The passport already
  /// loads the profile, so this costs no extra request.
  const skillCredentials = profile?.skillCredentials ?? [];

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; no-op */
    }
  }

  const pc = t.passport;
  const done = rep.successCount;
  const settled = rep.successCount + rep.disputedCount + rep.failedCount;
  const counterparties = rep.inputs?.distinctCounterparties;
  const volume = rep.inputs?.lifetimeVolumeUsdc ?? 0;
  const lastDealAt = rep.inputs?.lastActionAt;
  const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const tierName = TIER_LABEL[tier];
  const breadth = rep.terms?.breadth;
  const heldLine =
    rep.tierCappedBy === 'deals' && rep.dealsToNextTier
      ? (rep.dealsToNextTier === 1 ? pc.heldDealsOne : pc.heldDeals).replace('{tier}', tierName).replace('{n}', String(rep.dealsToNextTier))
      : null;
  // Deals with the same few people count for less; say how much, and what lifts it.
  const breadthLine =
    breadth != null && breadth < 1 && settled > 0 && counterparties
      ? (counterparties === 1 ? pc.breadthNoteOne : pc.breadthNote).replace('{n}', String(counterparties)).replace('{pct}', String(Math.round(breadth * 100)))
      : null;
  const rung = TIER_LADDER.indexOf(tier);

  return (
    <Shell>
      <section className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          <PassportPhoto src={profile?.profileImageDataUrl || profile?.xProfileImageUrl} address={address} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-semibold text-[var(--lp-dark)] sm:text-[26px]">{profile?.displayName || cp.fallbackName}</h1>
            <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">
              {[profile?.handle ? `@${profile.handle}` : null, tenureDays != null && registeredAt ? pc.since.replace('{date}', dateLabel(registeredAt)) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--lp-text-sub)]">
          <button type="button" onClick={copyAddress} className="inline-flex min-h-11 items-center gap-1.5 tabular-nums hover:text-[var(--lp-dark)]">
            {shortAddress(address)}
            <span className="text-[12px]">{copied ? cp.copyAddressDone : cp.copyAddressIdle}</span>
          </button>
          {profile?.xHandle && (
            <a href={`https://x.com/${profile.xHandle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center hover:text-[var(--lp-dark)]">
              @{profile.xHandle.replace(/^@/, '')}
            </a>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--lp-border-light)] pt-5">
          <p className="text-[13px] text-[var(--lp-text-sub)]">{pc.standing}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[34px] font-semibold leading-none text-[var(--lp-dark)]">{tierName}</span>
            <span className="text-[15px] tabular-nums text-[var(--lp-text-sub)]">{pc.scoreOf.replace('{score}', String(score))}</span>
          </div>
          {heldLine ? <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{heldLine}</p> : null}
          {breadthLine ? <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{breadthLine}</p> : null}
          <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={pc.standing}>
            {TIER_LADDER.map((band, index) => (
              <li key={band} aria-current={index === rung ? 'step' : undefined} className="min-w-0">
                <span aria-hidden className={`block h-[5px] rounded-full ${index < rung ? 'bg-[#6a8a1e]' : index === rung ? 'bg-[var(--lp-dark)]' : 'bg-[var(--lp-border-light)]'}`} />
                <span className={`mt-1.5 block truncate text-[12px] ${index === rung ? 'font-semibold text-[var(--lp-dark)]' : 'text-[var(--lp-text-sub)]'}`}>{TIER_LABEL[band]}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6">
          <h2 className="text-[13px] text-[var(--lp-text-sub)]">{pc.record}</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PassportFact label={pc.settled} value={String(settled)} />
            <PassportFact label={pc.completed} value={pc.completedOf.replace('{done}', String(done)).replace('{total}', String(settled))} />
            <PassportFact label={pc.disputes} value={String(rep.disputedCount)} />
            <PassportFact label={pc.volume} value={`${trimUsdc(String(volume))} USDC`} />
          </dl>
          <dl className="mt-3 divide-y divide-[var(--lp-border-light)] border-t border-[var(--lp-border-light)] text-[14px]">
            {counterparties != null ? (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[var(--lp-text-sub)]">{pc.counterparties}</dt>
                <dd className="tabular-nums text-[var(--lp-dark)]">{counterparties}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-[var(--lp-text-sub)]">{pc.stake}</dt>
              <dd className="tabular-nums text-[var(--lp-dark)]">{stakeSynced ? `${trimUsdc(stakeUsdc)} USDC` : cp.stats.syncing}</dd>
            </div>
            {lastDealAt ? (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[var(--lp-text-sub)]">{pc.lastDeal}</dt>
                <dd className="text-[var(--lp-dark)]">{dateLabel(lastDealAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {skillCredentials.length > 0 && (
          <div className="mt-5">
            <h2 className="text-[13px] text-[var(--lp-text-sub)]">{pc.skills}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {skillCredentials.map((credential) => (
                <li key={credential.skillId} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--lp-border-light)] px-3.5 text-[13px] text-[var(--lp-dark)]">
                  <span aria-hidden className="text-[#6a8a1e]"><CheckGlyph /></span>
                  {skillLabel(credential.skillId)}
                  <span className="text-[12px] tabular-nums text-[var(--lp-text-sub)]">{skillDateLabel(credential, cp.skills)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-start justify-between gap-x-6 border-t border-[var(--lp-border-light)] pt-1">
          {termRows.length > 0 ? (
            <details className="group min-w-0 flex-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-[14px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] [&::-webkit-details-marker]:hidden">
                {pc.how}
                <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="space-y-3 pb-4">
                {termRows.map((r) => (
                  <TermBar key={r.label} label={r.label} value={r.value} hue={hue} />
                ))}
                <p className="pt-1 text-[12px] leading-snug text-[var(--lp-text-sub)]">{cp.footer.disclaimer}</p>
              </div>
            </details>
          ) : null}
          <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center text-[14px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">
            {pc.proof}
          </a>
        </div>
      </section>

      {SME_TRADES_ENABLED && <SmePassportBand sme={sme} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[70vh] px-5 py-12 md:py-16">
      <div className="mx-auto w-full max-w-[680px]">
        <div className="mb-7">
          <BackButton tone="adaptive" showOnPublic fallbackHref="/partners" />
        </div>
        {children}
      </div>
    </main>
  );
}



function PassportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-[var(--lp-light)] px-3.5 py-3">
      <dt className="text-[13px] text-[var(--lp-text-sub)]">{label}</dt>
      <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-[var(--lp-dark)]">{value}</dd>
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
      financingsTaken?: number;
      financingsRepaid?: number;
      financingsDefaulted?: number;
    } | null;
  } | null;
}) {
  // Same labels as the COMPANY PROFILE band on /profile, read from the same
  // section so the two surfaces cannot drift apart.
  const smeT = useTranslations().smeCompany;
  if (!sme) return null;
  const p = sme.smeProfile;
  const r = sme.repaymentBehavior;
  const hasProfile = !!p && (p.companyName || p.sector || p.region || p.websiteUrl);
  const financed = r?.financingsTaken ?? 0;
  const hasRepay = !!r && (r.windowDealCount > 0 || financed > 0);
  if (!hasProfile && !hasRepay) return null;
  return (
    <section
      className="mt-8 rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-line)' }}>
        <p className="eyebrow">Company</p>
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
              {p!.sector ? <PassportRow label={smeT.view.sector} value={smeT.sectors[p!.sector as keyof typeof smeT.sectors] ?? p!.sector} /> : null}
              {p!.region ? <PassportRow label={smeT.view.region} value={p!.region} /> : null}
              {p!.primaryMarkets ? <PassportRow label={smeT.view.markets} value={p!.primaryMarkets} /> : null}
              {p!.minOrderValue ? <PassportRow label={smeT.view.minOrder} value={p!.minOrderValue} /> : null}
              {p!.leadTimeDays ? <PassportRow label={smeT.view.leadTime} value={smeT.view.leadTimeTemplate.replace('{days}', String(p!.leadTimeDays))} /> : null}
              {p!.certifications ? <PassportRow label={smeT.view.certifications} value={p!.certifications} /> : null}
              {p!.yearFounded ? <PassportRow label={smeT.view.founded} value={String(p!.yearFounded)} /> : null}
              {p!.employeeBand ? <PassportRow label={smeT.view.size} value={smeT.employeeBands[p!.employeeBand as keyof typeof smeT.employeeBands] ?? p!.employeeBand} /> : null}
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
              {smeT.repayment.eyebrow}
            </p>
            <p className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-ink-faint)' }}>
              {smeT.repayment.windowTemplate.replace('{count}', String(r!.windowDealCount))}
            </p>
            <dl className="mt-2 space-y-3.5">
              <PassportStat
                label={smeT.repayment.onTimeRate}
                value={`${Math.round(r!.onTimeRate * 100)}%`}
                tone={r!.onTimeRate >= 0.8 ? 'positive' : r!.onTimeRate >= 0.5 ? 'neutral' : 'critical'}
              />
              <PassportStat
                label={smeT.repayment.avgDaysToSettle}
                value={r!.averageDaysToSettle.toFixed(1)}
                tone="neutral"
              />
              <PassportStat
                label={smeT.repayment.defaults}
                value={String(r!.defaultCount)}
                tone={r!.defaultCount === 0 ? 'positive' : 'critical'}
              />
              {/* Trade-finance repayment: advances and PO principals this SME
                  took, and how many it repaid the financier. The signal a
                  financier underwrites on, distinct from plain deal settlement. */}
              {financed > 0 ? (
                <PassportStat
                  label={smeT.repayment.financingRepaid}
                  value={`${r!.financingsRepaid ?? 0}/${financed}`}
                  tone={
                    (r!.financingsDefaulted ?? 0) === 0
                      ? 'positive'
                      : (r!.financingsRepaid ?? 0) >= (r!.financingsDefaulted ?? 0)
                        ? 'neutral'
                        : 'critical'
                  }
                />
              ) : null}
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
        className={`text-[13px] text-end ${capitalize ? 'capitalize' : ''}`}
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

function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 8.5 6 12l7.5-8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PassportPhoto({ src, address }: { src?: string; address: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" width={56} height={56} className="size-14 shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />;
  }
  return <span className="shrink-0"><WalletAvatar address={address} size={56} /></span>;
}
