'use client';
import { Hint } from '@/shared/components/Hint';
import { Price } from '@/features/money/components/Price';
import { useTierLabels } from '@/features/reputation/useTierLabels';
import { useEffect, useState } from 'react';
import { api, type Reputation, type UserProfile, profilePhotoOf } from '@/core/api';
import { type CompositeTier } from '@/features/reputation/tierColors';
import { shortAddress } from '@/shared/utils/format';
import { skillDateLabel, skillLabel } from '../skillCredentials';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { BackButton } from '@/shared/components/BackButton';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { useAuth } from '@/shared/hooks/useAuth';
import { AttestedDeals } from './AttestedDeals';
import { PassportSharePanel } from './PassportSharePanel';
import { passportShareCopy } from '@/shared/i18n/messages/passportShare';
import { yourAgentCopy } from '@/shared/i18n/messages/yourAgent';
import { CARD_CLASS } from '@/shared/components/Card';
import { Icon } from '@/shared/components/Icon';
import Link from 'next/link';

const EXPLORER = 'https://testnet.arcscan.app';
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const TIER_LADDER: CompositeTier[] = ['NEW', 'COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];

/// Ordered list of the composite term keys the engine returns. The visible
/// label for each comes from i18n at render time; the order here drives the
/// vertical ordering in the Score factors section.
const TERM_KEYS = ['completion', 'breadth', 'stake', 'volume', 'tenure', 'activity', 'referral'] as const;
type TermKey = (typeof TERM_KEYS)[number];

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

/// `share` is a share link's token (view 29): the owner opened their full
/// passport to this viewer. When the share has ended the backend answers with
/// the sealed passport and `onSealed` hands the page back to it.
export function CreditPassport({ address, share, onSealed }: { address: string; share?: string; onSealed?: () => void }) {
  const TIER_LABEL = useTierLabels();
  const t = useTranslations();
  const cp = t.creditPassport;
  const { locale } = useLocale();
  const valid = ADDR_RE.test(address);
  const viewer = useAuth().address;
  const isOwner = !!viewer && viewer.toLowerCase() === address.toLowerCase();
  const sc = passportShareCopy[locale];
  const [rep, setRep] = useState<Reputation | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
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

    async function load() {
      const [repRes, profRes, smeRes] = await Promise.allSettled([
        api.reputation(address, false, share),
        api.getProfile(address),
        // The SME profile only matters when the trade rail is live; skip
        // the call otherwise.
        SME_TRADES_ENABLED ? api.getSmeProfile(address, share) : Promise.resolve(null),
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
      if ('sealed' in repRes.value) {
        if (onSealed) onSealed();
        else setFetchState('error');
        return;
      }
      setRep(repRes.value);
      setProfile(profRes.status === 'fulfilled' ? profRes.value.profile : null);
      setFetchState('ready');
    }

    setFetchState('loading');
    void load();

    return () => {
      cancelled = true;
    };
  }, [address, valid, share, onSealed]);

  if (!valid) {
    return (
      <Shell>
        <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{cp.eyebrow}</p>
        <h1 className="mt-2 text-[28px] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
          {cp.invalid.headline}
        </h1>
        <p className="mt-3 text-[14px] text-[var(--ink-secondary)] font-medium">{cp.invalid.body}</p>
      </Shell>
    );
  }

  if (fetchState === 'loading' || fetchState === 'idle') {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-3 w-32 rounded bg-[var(--raised)] animate-pulse motion-reduce:animate-none" />
          <div className="h-10 w-72 rounded bg-[var(--raised)] animate-pulse motion-reduce:animate-none" />
          <div className="h-40 rounded bg-[var(--raised)] animate-pulse motion-reduce:animate-none" />
        </div>
      </Shell>
    );
  }

  if (fetchState === 'error' || !rep) {
    return (
      <Shell>
        <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{cp.eyebrow}</p>
        <h1 className="mt-2 text-[28px] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
          {cp.error.headline}
        </h1>
        <p className="mt-3 text-[14px] text-[var(--ink-secondary)] font-medium">
          {cp.error.bodyTemplate.replace('{address}', shortAddress(address))}
        </p>
      </Shell>
    );
  }

  const tier: CompositeTier = rep.tier ?? 'NEW';
  const score = Math.round(rep.score ?? 0);
  const total = rep.totalDeals;

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
  // The deal guarantee as reputation counts it, on the new vault and the previous one.
  const guaranteeUsdc = String(rep.inputs?.stakeUsdc ?? 0);
  const lastDealAt = rep.inputs?.lastActionAt;
  const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const tierName = TIER_LABEL[tier];
  const breadth = rep.terms?.breadth;
  const heldLine =
    rep.tierCappedBy === 'deals' && rep.dealsToNextTier
      ? (rep.dealsToNextTier === 1 ? pc.heldDealsOne : pc.heldDeals).replace('{tier}', tierName).replace('{n}', String(rep.dealsToNextTier))
      : null;
  // Deals with the same few people count for less; say how much, and what lifts it.
  // The owner reads how to raise it; someone they shared it with reads the fact.
  const breadthLine =
    breadth != null && breadth < 1 && settled > 0 && counterparties
      ? (isOwner ? (counterparties === 1 ? pc.breadthNoteOne : pc.breadthNote) : counterparties === 1 ? sc.breadthOne : sc.breadth)
          .replace('{n}', String(counterparties))
          .replace('{pct}', String(Math.round(breadth * 100)))
      : null;
  const sharedLine = !isOwner && rep.shared
    ? sc.sharedBy.replace('{who}', rep.shared.by).replace('{date}', new Date(rep.shared.until).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
    : null;
  const rung = TIER_LADDER.indexOf(tier);

  const more = yourAgentCopy[locale as keyof typeof yourAgentCopy] ?? yourAgentCopy.en;
  const ROW = 'flex min-h-12 items-center justify-between gap-4 py-3 text-[15px]';
  // On a phone the label takes the room and the figure never breaks (owner, 5 Nov 2026).
  const LABEL = 'min-w-0 flex-1 text-[var(--ink-secondary)]';
  const VALUE = 'shrink-0 whitespace-nowrap text-end font-semibold tabular-nums text-[var(--ink)]';

  return (
    <Shell>
      {/* The record is its own page (owner, 3 Nov 2026); Profile keeps one line for it. */}
      <p className="flex items-center gap-2 text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
        {pc.record}
        <Hint side="bottom">{t.record.meaning}</Hint>
      </p>
      {sharedLine ? <p className="mt-3 text-[14px] font-medium text-[var(--ink-secondary)]">{sharedLine}</p> : null}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <PassportPhoto src={profilePhotoOf(profile)} address={address} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-semibold text-[var(--ink)]">{profile?.displayName || cp.fallbackName}</h1>
          <p className="mt-0.5 text-[14px] font-medium text-[var(--ink-secondary)]">
            {[profile?.handle ? `@${profile.handle}` : null, tenureDays != null && registeredAt ? pc.since.replace('{date}', dateLabel(registeredAt)) : null].filter(Boolean).join(' · ')}
          </p>
          {profile?.xHandle ? (
            <a href={`https://x.com/${profile.xHandle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]">
              @{profile.xHandle.replace(/^@/, '')}
            </a>
          ) : null}
        </div>
      </div>

      <section className={`${CARD_CLASS} mt-5 p-5`}>
        <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{pc.standing}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[30px] font-semibold leading-none text-[var(--ink)]">{tierName}</span>
          <span className="text-[15px] tabular-nums text-[var(--ink-secondary)]">{pc.scoreOf.replace('{score}', String(score))}</span>
        </div>
        {heldLine ? <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{heldLine}</p> : null}
        {breadthLine ? <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{breadthLine}</p> : null}
        <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={pc.standing}>
          {TIER_LADDER.map((band, index) => (
            <li key={band} aria-current={index === rung ? 'step' : undefined} className="min-w-0">
              <span aria-hidden className={`block h-[5px] rounded-full ${index < rung ? 'bg-[var(--ink-secondary)]' : index === rung ? 'bg-[var(--ink)]' : 'bg-[var(--line)]'}`} />
              {/* The heading names the level on phones; the full ladder stays available to screen readers. */}
              <span className={`sr-only text-[14px] sm:not-sr-only sm:mt-1.5 sm:block ${index === 0 ? 'text-start' : index === TIER_LADDER.length - 1 ? 'text-end' : 'text-center'} ${index === rung ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-secondary)]'}`}>{TIER_LABEL[band]}</span>
            </li>
          ))}
        </ol>
      </section>

      <h2 className="mt-7 text-[17px] font-semibold text-[var(--ink)]">{pc.deals}</h2>
      <dl className={`${CARD_CLASS} mt-3 grid grid-cols-3 divide-x divide-[var(--line)] py-4 rtl:divide-x-reverse`}>
        <PassportFact label={pc.settled} value={String(settled)} />
        <PassportFact label={pc.completed} value={pc.completedOf.replace('{done}', String(done)).replace('{total}', String(settled))} />
        <PassportFact label={pc.disputes} value={String(rep.disputedCount)} />
      </dl>
      <div className={`${CARD_CLASS} mt-3 divide-y divide-[var(--line)] px-5`}>
        <dl className="divide-y divide-[var(--line)]">
          <div className={ROW}>
            <dt className={LABEL}>{pc.volume}</dt>
            <dd className={VALUE}><Price usdc={Number(volume)} className="items-end" /></dd>
          </div>
          {counterparties != null ? (
            <div className={ROW}>
              <dt className={LABEL}>{pc.counterparties}</dt>
              <dd className={VALUE}>{counterparties}</dd>
            </div>
          ) : null}
          <div className={ROW}>
            <dt className={LABEL}>{pc.stake}</dt>
            <dd className={VALUE}><Price usdc={Number(guaranteeUsdc)} className="items-end" /></dd>
          </div>
          {lastDealAt ? (
            <div className={ROW}>
              <dt className={LABEL}>{pc.lastDeal}</dt>
              <dd className={VALUE}>{dateLabel(lastDealAt)}</dd>
            </div>
          ) : null}
        </dl>
        {termRows.length > 0 ? (
          <details className="group">
            <summary className={`${ROW} cursor-pointer list-none text-[var(--ink)] [&::-webkit-details-marker]:hidden`}>
              {pc.how}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[var(--ink-secondary)] transition-transform group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <div className="space-y-3 pb-4">
              {termRows.map((r) => (
                <TermBar key={r.label} label={r.label} value={r.value} />
              ))}
              <p className="pt-1 text-[14px] leading-snug text-[var(--ink-secondary)] font-medium">{cp.footer.disclaimer}</p>
            </div>
          </details>
        ) : null}
        {/* The wallet address is proof, not identity: it sits with the link to Arc. */}
        <div className={ROW}>
          <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[var(--ink)] hover:underline">
            {pc.proof}
          </a>
          <button type="button" onClick={copyAddress} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium tabular-nums text-[var(--ink-secondary)] hover:text-[var(--ink)]">
            {shortAddress(address)}
            <span>{copied ? cp.copyAddressDone : cp.copyAddressIdle}</span>
          </button>
        </div>
      </div>

      {skillCredentials.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[14px] text-[var(--ink-secondary)] font-medium">{pc.skills}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {skillCredentials.map((credential) => (
              <li key={credential.skillId} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] px-3.5 text-[14px] text-[var(--ink)]">
                <span aria-hidden className="text-[var(--ink)]"><CheckGlyph /></span>
                {skillLabel(credential.skillId)}
                <span className="text-[14px] tabular-nums text-[var(--ink-secondary)] font-medium">{skillDateLabel(credential, cp.skills)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOwner ? (
        <>
          <h2 className="mt-7 text-[17px] font-semibold text-[var(--ink)]">{pc.more}</h2>
          <nav aria-label={pc.more} className={`${CARD_CLASS} mt-3 divide-y divide-[var(--line)] px-5`}>
            {[
              { label: t.profilePage.publicView, href: profile?.handle ? `/r/${profile.handle}` : '/profile/edit' },
              { label: t.dealGuarantee.profile.legacyContracts, href: '/legacy' },
              { label: more.recordSources, href: '/profile/sources' },
            ].map((row) => (
              <Link key={row.href} href={row.href} className={`${ROW} text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]`}>
                {row.label}
                <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--ink-secondary)]" />
              </Link>
            ))}
          </nav>
          <PassportSharePanel />
        </>
      ) : null}
      <AttestedDeals address={address} downloadable={isOwner} />
      {SME_TRADES_ENABLED && <SmePassportBand sme={sme} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[70vh] px-5 py-12 md:py-16">
      <div className="mx-auto w-full max-w-[680px]">
        {/* Back on this column; the app's page-edge copy steps aside. */}
        <div data-own-back className="-ms-2 mb-5">
          <BackButton tone="adaptive" showOnPublic fallbackHref="/market" />
        </div>
        {children}
      </div>
    </main>
  );
}



function PassportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse items-center gap-0.5 px-2 text-center">
      <dt className="text-[14px] font-medium text-[var(--ink-secondary)]">{label}</dt>
      <dd className="text-[19px] font-semibold tabular-nums text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function TermBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] text-[var(--ink-secondary)] font-medium">{label}</span>
        <span className="text-[14px] tabular-nums text-[var(--ink-muted)]">{Math.round(pct)}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full" style={{ background: 'var(--raised)' }}>
        <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
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
      style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[14px] font-medium text-[var(--ink-secondary)]">Company</p>
      </div>
      <div className="p-6 md:p-7 grid md:grid-cols-2 gap-6">
        {hasProfile ? (
          <div className="space-y-3.5">
            {p!.companyName ? (
              <p className="text-[18px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
                {p!.companyName}
                {p!.verifiedAt ? (
                  <span className="ms-2 text-[14px] font-semibold px-1.5 py-0.5 align-middle" style={{ background: 'var(--ink)', color: 'var(--ink)' }}>
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
                      style={{ color: 'var(--ink)' }}
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
          <p className="text-[14px]" style={{ color: 'var(--ink-secondary)' }}>
            No company profile published.
          </p>
        )}
        {hasRepay ? (
          <div className="space-y-3.5">
            <p className="text-[14px]" style={{ color: 'var(--ink-muted)' }}>
              {smeT.repayment.eyebrow}
            </p>
            <p className="text-[14px]" style={{ color: 'var(--ink-muted)' }}>
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
      <dt className="text-[14px]" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </dt>
      <dd
        className={`text-[14px] text-end ${capitalize ? 'capitalize' : ''}`}
        style={{ color: 'var(--ink)' }}
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
      ? 'var(--ink)'
      : tone === 'critical'
        ? 'var(--color-danger, #b03d3a)'
        : 'var(--ink)';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[14px]" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </dt>
      <dd className="text-[18px] tabular-nums font-semibold" style={{ color }}>
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

export function PassportPhoto({ src, address }: { src?: string; address: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} referrerPolicy="no-referrer" alt="" width={56} height={56} className="size-14 shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />;
  }
  return <span className="shrink-0"><WalletAvatar address={address} size={56} /></span>;
}
