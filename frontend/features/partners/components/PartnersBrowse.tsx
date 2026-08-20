'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type Partner } from '@/core/api';
import { isBusinessAccount } from '@/features/account/accountKind';
import { DiscoveryNav } from '@/features/discovery/components/DiscoveryNav';
import { filterPartners, type PartnerSort } from '@/features/discovery/model';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { Button, buttonClasses } from '@/shared/components/Button';
import { Skeleton, SkeletonText } from '@/shared/components/Skeleton';
import {
  Accent,
  Band,
  FullBleed,
  GridOverlay,
  HeroHeadline,
  PageCard,
  Punc,
  SectionTag,
} from '@/shared/components/Bands';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

const SECTORS = [
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
] as const;

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export function PartnersBrowse() {
  const copy = useTranslations().partnersBrowse;
  const auth = useAuth();
  const { profile } = useUserProfile();
  const businessAccount = auth.isAuthenticated && isBusinessAccount(profile);
  const canOpenBusinessDeal = SME_TRADES_ENABLED && businessAccount;

  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<PartnerSort>('trust');
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [state, setState] = useState<FetchState>('idle');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(partners === null ? 'loading' : 'idle');
    api
      .getPartners()
      .then((result) => {
        if (cancelled) return;
        setPartners(result.partners);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
    // Retain the last successful directory while a manual retry is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken]);

  const filtered = useMemo(
    () =>
      filterPartners(partners ?? [], {
        query,
        sector,
        verifiedOnly,
        sort,
      }),
    [partners, query, sector, verifiedOnly, sort],
  );
  const filtersActive = query.trim() !== '' || sector !== '' || verifiedOnly || sort !== 'trust';
  const resultCopy = (filtered.length === 1 ? copy.resultsOne : copy.resultsMany).replace(
    '{n}',
    String(filtered.length),
  );

  function clearFilters() {
    setQuery('');
    setSector('');
    setVerifiedOnly(false);
    setSort('trust');
  }

  return (
    <FullBleed>
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <SectionTag tone="dark">{copy.sectionTag}</SectionTag>
        <HeroHeadline size="sm">
          Source a <Accent>{copy.headlineAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 max-w-[58ch] text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
          {copy.heroBody}
        </p>
        <DiscoveryNav active="partners" tone="dark" />
        {!SME_TRADES_ENABLED ? (
          <div className="mt-6 max-w-[62ch] border-s-[3px] border-[var(--lp-accent)] bg-white/[0.04] px-4 py-3">
            <p className="mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-accent)]">
              {copy.pilotOnly}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{copy.pilotBody}</p>
          </div>
        ) : null}
      </Band>

      <Band tone="light" compact>
        <div className="border-b border-[var(--lp-border-light)] pb-6">
          <SectionTag>{copy.sectionTag}</SectionTag>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h2 className="max-w-[18ch] font-sans text-[clamp(1.65rem,3vw,2.5rem)] font-extrabold uppercase leading-[0.98] tracking-[-0.025em] text-[var(--lp-dark)]">
                {copy.directoryTitle}
                <Punc>.</Punc>
              </h2>
              <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                {copy.listedDetailsNote}
              </p>
            </div>
            <p
              className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] lg:text-end"
              aria-live="polite"
            >
              {state === 'idle' ? `${copy.refreshing} · ` : ''}
              {partners !== null ? resultCopy : ''}
            </p>
          </div>
        </div>

        <div className="py-6" role="search" aria-label={copy.searchLabel}>
          <label className="block max-w-2xl">
            <span className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {copy.searchLabel}
            </span>
            <span className="relative mt-2 block">
              <svg
                aria-hidden
                viewBox="0 0 18 18"
                fill="none"
                className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lp-text-muted)]"
              >
                <circle cx="7.75" cy="7.75" r="4.75" stroke="currentColor" strokeWidth="1.5" />
                <path d="m11.25 11.25 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="form-input min-h-12 w-full ps-11 pe-4"
                style={{ paddingInlineStart: 44 }}
                maxLength={120}
              />
            </span>
          </label>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <FilterGroup label={copy.sectorLabel}>
              <FilterButton pressed={sector === ''} onClick={() => setSector('')}>
                {copy.allSectors}
              </FilterButton>
              {SECTORS.map((value) => (
                <FilterButton key={value} pressed={sector === value} onClick={() => setSector(value)}>
                  {value}
                </FilterButton>
              ))}
            </FilterGroup>

            <div className="flex flex-wrap items-end gap-3 xl:justify-end">
              <FilterGroup label={copy.sortLabel}>
                <FilterButton pressed={sort === 'trust'} onClick={() => setSort('trust')}>
                  {copy.sortTrust}
                </FilterButton>
                <FilterButton pressed={sort === 'name'} onClick={() => setSort('name')}>
                  {copy.sortName}
                </FilterButton>
              </FilterGroup>
              <button
                type="button"
                aria-pressed={verifiedOnly}
                onClick={() => setVerifiedOnly((value) => !value)}
                className="mb-1 inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] border px-3 mono text-[10px] font-semibold uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
                style={{
                  borderColor: verifiedOnly ? 'var(--color-positive)' : 'var(--lp-border-light)',
                  background: verifiedOnly ? 'var(--color-positive-soft)' : 'var(--lp-card)',
                  color: verifiedOnly ? 'var(--color-positive)' : 'var(--lp-text-sub)',
                }}
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                {copy.verifiedOnly}
              </button>
              {filtersActive ? (
                <Button type="button" variant="ghost" onClick={clearFilters}>
                  {copy.clear}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {state === 'error' ? (
          <div
            role="alert"
            className="mb-6 flex flex-col gap-4 border-s-[3px] border-[var(--color-critical)] bg-[var(--color-critical-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="font-sans text-[17px] font-bold text-[var(--lp-dark)]">{copy.errorTitle}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{copy.errorBody}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setRetryToken((value) => value + 1)} className="shrink-0 self-start sm:self-auto">
              {copy.retry}
            </Button>
          </div>
        ) : null}

        {partners === null && state !== 'error' ? <PartnersSkeleton /> : null}

        {partners !== null && filtered.length === 0 && state !== 'error' ? (
          <PageCard>
            <div className="px-6 py-10 sm:px-8 sm:py-12">
              <SectionTag>{copy.sectionTag}</SectionTag>
              <h2 className="mt-4 max-w-[28ch] font-sans text-[24px] font-extrabold uppercase leading-tight tracking-[-0.02em] text-[var(--lp-dark)]">
                {copy.emptyTitle}
              </h2>
              <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {copy.emptyBody}
              </p>
              {filtersActive ? (
                <Button type="button" variant="outline" onClick={clearFilters} className="mt-6">
                  {copy.clear}
                </Button>
              ) : null}
            </div>
          </PageCard>
        ) : null}

        {filtered.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((partner) => (
              <PartnerCard
                key={partner.address}
                partner={partner}
                copy={copy}
                canOpenBusinessDeal={canOpenBusinessDeal}
                isAuthenticated={auth.isAuthenticated}
                businessAccount={businessAccount}
              />
            ))}
          </div>
        ) : null}
      </Band>
    </FullBleed>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </legend>
      <div className="mt-2 flex max-w-full items-center gap-1 overflow-x-auto pb-1">{children}</div>
    </fieldset>
  );
}

function FilterButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] border px-3 mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
      style={{
        borderColor: pressed ? 'var(--lp-band-dark)' : 'var(--lp-border-light)',
        // Theme-independent on purpose: --lp-dark inverts in dark mode, which
        // turned the selected chip into a cream slab carrying lime text.
        background: pressed ? 'var(--lp-band-dark)' : 'var(--lp-card)',
        color: pressed ? 'var(--lp-accent)' : 'var(--lp-text-sub)',
      }}
    >
      {children}
    </button>
  );
}

function PartnerCard({
  partner,
  copy,
  canOpenBusinessDeal,
  isAuthenticated,
  businessAccount,
}: {
  partner: Partner;
  copy: Messages['partnersBrowse'];
  canOpenBusinessDeal: boolean;
  isAuthenticated: boolean;
  businessAccount: boolean;
}) {
  const primaryHref = canOpenBusinessDeal
    ? `/buyer?seller=${partner.address}`
    : SME_TRADES_ENABLED
      ? '/profile'
      : null;
  const primaryLabel = canOpenBusinessDeal
    ? copy.openDeal
    : !isAuthenticated
      ? copy.signInToTrade
      : !businessAccount
        ? copy.registerBusiness
        : copy.pilotOnly;

  return (
    <article className="h-full">
      <PageCard className="h-full">
        <div className="flex h-full flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-sans text-[20px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--lp-dark)]">
                {partner.name}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {partner.sector ? <Chip label={partner.sector} accent /> : null}
                {partner.region ? <Chip label={partner.region} /> : null}
                {partner.canSupply ? <Chip label={copy.supplies} /> : null}
              </div>
            </div>
            <ReputationBadge address={partner.address} size="sm" withDetail />
          </div>

          {partner.verified ? (
            <div className="mt-4 border-s-[3px] border-[var(--color-positive)] bg-[var(--color-positive-soft)] px-3 py-2.5">
              <p className="mono text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--color-positive)]">
                {copy.identityVerified}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--lp-text-sub)]">
                {copy.identityNote}
              </p>
            </div>
          ) : null}

          {partner.primaryMarkets || partner.minOrderValue || partner.leadTimeDays || partner.certifications ? (
            <dl className="mt-4 space-y-2.5 border-t border-[var(--lp-border-light)] pt-4">
              {partner.primaryMarkets ? <CapRow label={copy.markets} value={partner.primaryMarkets} /> : null}
              {partner.minOrderValue ? <CapRow label={copy.minimumOrder} value={partner.minOrderValue} /> : null}
              {partner.leadTimeDays ? (
                <CapRow
                  label={copy.leadTime}
                  value={copy.leadTimeTemplate.replace('{n}', String(partner.leadTimeDays))}
                />
              ) : null}
              {partner.certifications ? (
                <CapRow label={copy.listedCertifications} value={partner.certifications} />
              ) : null}
            </dl>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
            {primaryHref ? (
              <Link href={primaryHref} className={buttonClasses()}>
                {primaryLabel}
                <span aria-hidden>→</span>
              </Link>
            ) : null}
            <Link
              href={`/credit-passport/${partner.address}`}
              className={buttonClasses({ variant: 'ghost' })}
            >
              {copy.viewTrustProfile}
              <span aria-hidden>↗</span>
            </Link>
          </div>
        </div>
      </PageCard>
    </article>
  );
}

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className="mono text-[9px] font-bold uppercase tracking-[0.11em]"
      style={{ color: accent ? 'var(--lp-dark)' : 'var(--lp-text-muted)' }}
    >
      {label}
    </span>
  );
}

function CapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] items-baseline gap-4">
      <dt className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
        {label}
      </dt>
      <dd className="min-w-0 text-end text-[13px] leading-relaxed text-[var(--lp-dark)]">{value}</dd>
    </div>
  );
}

function PartnersSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-3 h-3 w-1/2" />
          <SkeletonText lines={3} className="mt-6" />
          <Skeleton className="mt-6 h-11 w-full" />
        </div>
      ))}
    </div>
  );
}
