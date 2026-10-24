'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type Partner } from '@/core/api';
import { DiscoveryNav } from '@/features/discovery/components/DiscoveryNav';
import { filterPartners, type PartnerSort } from '@/features/discovery/model';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { FilterButton, FilterGroup, SortMenu } from '@/features/discovery/components/FilterBar';
import { Skeleton, SkeletonText } from '@/shared/components/Skeleton';
import { Band, FullBleed } from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { Icon } from '@/shared/components/Icon';
import { listedAmount } from '../partnerFacts';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
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

type SectorLabels = Messages['smeCompany']['sectors'];

function sectorLabel(labels: SectorLabels, value: string | null | undefined): string | null {
  if (!value) return null;
  return value in labels ? labels[value as keyof SectorLabels] : value;
}

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export function PartnersBrowse() {
  const messages = useTranslations();
  const copy = messages.partnersBrowse;
  const sectorLabels = messages.smeCompany.sectors;
  const auth = useAuth();
  const { isBusinessWorkspace } = useWorkspaceContext();
  const businessAccount = auth.isAuthenticated && isBusinessWorkspace;
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

  const quietAction = 'inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--tint)] px-5 text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--tint)_92%,var(--ink))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]';
  const clearAction = 'inline-flex min-h-11 items-center rounded-full px-2 text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]';

  return (
    <div className="product-surface">
    <FullBleed>
      <Band tone="light" compact>
        {/* Partners is a tab of Discover: the same title, nav, search and bar. */}
        <div className="pt-2 sm:pt-3">
          <h1 className="text-[36px] font-medium leading-[1.1] tracking-[-0.015em] text-[var(--ink)] sm:text-[40px]">
            {messages.listingsBrowse.heroTitle}
          </h1>
          <DiscoveryNav active="partners" tone="light" appearance="quiet" />
          {!SME_TRADES_ENABLED ? (
            <p className="mt-3 text-[14px] font-medium text-[var(--ink-secondary)]">{copy.pilotLine}</p>
          ) : null}
        </div>

        <div className="py-6" role="search" aria-label={copy.searchLabel}>
          <label className="block">
            <span className="sr-only">{copy.searchLabel}</span>
            <span className="relative block">
              <Icon name="search" size={20} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[var(--ink-secondary)]" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="min-h-[52px] w-full rounded-[14px] border-0 bg-[var(--tint)] ps-12 pe-4 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
                maxLength={120}
              />
            </span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* A sector narrows the list when on; pressing it again shows every sector. */}
            <FilterGroup label={copy.sectorLabel}>
              {SECTORS.map((value) => (
                <FilterButton key={value} pressed={sector === value} onClick={() => setSector(sector === value ? '' : value)}>
                  {sectorLabels[value]}
                </FilterButton>
              ))}
            </FilterGroup>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <FilterGroup label={copy.verifiedOnly}>
                <FilterButton pressed={verifiedOnly} onClick={() => setVerifiedOnly((value) => !value)}>
                  {copy.verifiedOnly}
                </FilterButton>
              </FilterGroup>
              <div className="ms-auto flex items-center gap-2">
                {filtersActive ? (
                  <button type="button" onClick={clearFilters} className={clearAction}>
                    {copy.clear}
                  </button>
                ) : null}
                <SortMenu
                  label={copy.sortLabel}
                  value={sort}
                  options={[
                    { value: 'trust', label: copy.sortTrust },
                    { value: 'name', label: copy.sortName },
                  ]}
                  onChange={setSort}
                />
              </div>
            </div>
          </div>
        </div>

        {state === 'error' ? (
          <div role="alert" className="mb-6 flex flex-col gap-4 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[17px] font-medium text-[var(--ink)]">{copy.errorTitle}</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{copy.errorBody}</p>
            </div>
            <button type="button" onClick={() => setRetryToken((value) => value + 1)} className={quietAction}>
              {copy.retry}
            </button>
          </div>
        ) : null}

        {partners !== null && state !== 'error' ? (
          <p className="mb-3 text-[14px] font-medium text-[var(--ink-secondary)]" aria-live="polite">
            {state === 'idle' ? `${copy.refreshing} · ` : ''}
            {resultCopy} · {copy.listedDetailsNote}
          </p>
        ) : null}

        {partners === null && state !== 'error' ? <PartnersSkeleton /> : null}

        {partners !== null && filtered.length === 0 && state !== 'error' ? (
          <div className="border-t border-[var(--line)] py-8 sm:py-10">
            <h2 className="text-[22px] font-medium leading-tight tracking-[-0.015em] text-[var(--ink)]">{copy.emptyTitle}</h2>
            <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">{copy.emptyBody}</p>
            {filtersActive ? (
              <button type="button" onClick={clearFilters} className={`${quietAction} mt-6`}>
                {copy.clear}
              </button>
            ) : null}
          </div>
        ) : null}

        {filtered.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((partner) => (
              <li key={partner.address} className="min-w-0">
                <PartnerCard
                  partner={partner}
                  copy={copy}
                  sectorLabels={sectorLabels}
                  tierTemplate={messages.listingsBrowse.card.tierTemplate}
                  canOpenBusinessDeal={canOpenBusinessDeal}
                  isAuthenticated={auth.isAuthenticated}
                  businessAccount={businessAccount}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </Band>
    </FullBleed>
    </div>
  );
}

function PartnerCard({
  partner,
  copy,
  sectorLabels,
  tierTemplate,
  canOpenBusinessDeal,
  isAuthenticated,
  businessAccount,
}: {
  partner: Partner;
  copy: Messages['partnersBrowse'];
  sectorLabels: SectorLabels;
  tierTemplate: string;
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
  const meta = [sectorLabel(sectorLabels, partner.sector), partner.region, partner.canSupply ? copy.supplies : null].filter(
    (value): value is string => Boolean(value),
  );
  const minOrder = listedAmount(partner.minOrderValue);
  const facts = [
    partner.primaryMarkets ? { label: copy.markets, value: partner.primaryMarkets } : null,
    minOrder ? { label: copy.minimumOrder, value: minOrder } : null,
    partner.leadTimeDays ? { label: copy.leadTime, value: copy.leadTimeTemplate.replace('{n}', String(partner.leadTimeDays)) } : null,
    partner.certifications ? { label: copy.listedCertifications, value: partner.certifications } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  // The same white card as a Discover trade: a pale label up top, the name as
  // the loudest line, then the facts the business listed, then the way in.
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <div className="flex min-h-7 items-center justify-between gap-2 text-[14px] font-medium text-[var(--ink-secondary)]">
        {partner.verified ? (
          <span className="inline-flex items-center gap-1">
            <span className="rounded-full bg-[var(--color-positive-soft)] px-2.5 py-0.5 font-semibold text-[var(--color-positive)]">{copy.verified}</span>
            <Hint side="bottom">{copy.identityNote}</Hint>
          </span>
        ) : <span />}
        <ReputationBadge address={partner.address} appearance="text" textTemplate={tierTemplate} />
      </div>
      <h3 dir="auto" className="mt-3 line-clamp-2 text-[18px] font-medium leading-[1.3] tracking-[-0.015em] text-[var(--ink)]">
        {partner.name}
      </h3>
      {meta.length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[14px] leading-5 text-[var(--ink-secondary)] font-medium">{meta.join(' · ')}</p>
      ) : null}
      {facts.length > 0 ? (
        <dl className="mt-4 space-y-2 border-t border-[var(--lp-border-light)] pt-4 text-[14px]">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="shrink-0 font-medium text-[var(--ink-secondary)]">{fact.label}</dt>
              <dd dir="auto" className="min-w-0 truncate text-end font-medium text-[var(--ink)]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        {primaryHref ? (
          <Link href={primaryHref} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--action)] px-4 text-[14px] font-medium text-[var(--on-action)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]">
            {primaryLabel}
          </Link>
        ) : null}
        <Link
          href={`/credit-passport/${partner.address}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-[14px] font-semibold text-[var(--ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
        >
          {copy.viewTrustProfile}
          <Icon name="chevron-right" size={16} directional className="shrink-0" />
        </Link>
      </div>
    </article>
  );
}

function PartnersSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="mt-4 h-6 w-2/3" />
          <SkeletonText lines={2} className="mt-4" />
          <Skeleton className="mt-5 h-11 w-36" />
        </div>
      ))}
    </div>
  );
}
