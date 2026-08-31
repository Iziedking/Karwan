'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type Listing, type MarketplaceBrief } from '@/core/api';
import { isBusinessAccount } from '@/features/account/accountKind';
import { DiscoveryNav } from '@/features/discovery/components/DiscoveryNav';
import {
  buildDiscoveryCards,
  discoveryRail,
  filterDiscoveryCards,
  isVisibleToAudience,
  type DiscoveryAudience,
  type DiscoveryCard,
  type DiscoveryScope,
  type DiscoverySide,
  type DiscoverySort,
} from '@/features/discovery/model';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { Button } from '@/shared/components/Button';
import { CtaArrow, withoutTrailingArrow } from '@/shared/components/CtaArrow';
import { Skeleton, SkeletonText } from '@/shared/components/Skeleton';
import {
  Accent,
  Band,
  CTAPill,
  FullBleed,
  GridOverlay,
  HeroHeadline,
  PageCard,
  Punc,
  SectionTag,
} from '@/shared/components/Bands';
import { PageTour } from '@/shared/guide/PageTour';
import { MARKET_BIZ_TOUR_ID, MARKET_TOUR_ID, buildMarketSteps } from '@/shared/guide/tours';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import { formatUsdc, relativeTime } from '@/shared/utils/format';

type CardVariant = 'default' | 'summary' | 'hiring';
type SourceName = 'offers' | 'requests';

interface MarketSection {
  key: string;
  title: string;
  note: string;
  cards: DiscoveryCard[];
  variant: CardVariant;
}

export function ListingsBrowse() {
  const translations = useTranslations();
  const copy = translations.listingsBrowse;
  const homeHero = translations.appHome.hero;
  const { address, isAuthenticated } = useAuth();
  const { profile } = useUserProfile();
  const onBusinessTrack = isAuthenticated && isBusinessAccount(profile);
  const audience: DiscoveryAudience = !isAuthenticated
    ? 'public'
    : onBusinessTrack
      ? 'business'
      : 'person';

  const [listings, setListings] = useState<Listing[] | null>(null);
  const [briefs, setBriefs] = useState<MarketplaceBrief[] | null>(null);
  const [failedSources, setFailedSources] = useState<SourceName[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<'all' | DiscoverySide>('all');
  const [scope, setScope] = useState<DiscoveryScope>('all');
  const [sort, setSort] = useState<DiscoverySort>('newest');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setRefreshing(true);
      const [offersResult, requestsResult] = await Promise.allSettled([
        api.listings(),
        api.marketplaceBriefs(),
      ]);
      if (cancelled) return;

      const failures: SourceName[] = [];
      if (offersResult.status === 'fulfilled') {
        setListings(offersResult.value.listings);
      } else {
        failures.push('offers');
        setListings((current) => current ?? []);
      }
      if (requestsResult.status === 'fulfilled') {
        setBriefs(requestsResult.value.briefs);
      } else {
        failures.push('requests');
        setBriefs((current) => current ?? []);
      }
      setFailedSources(failures);
      setRefreshing(false);
    }

    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [reloadToken]);

  const cards = useMemo(
    () => buildDiscoveryCards(listings ?? [], briefs ?? [], { viewerAddress: address }),
    [listings, briefs, address],
  );
  const visibleCards = useMemo(
    () => cards.filter((card) => isVisibleToAudience(card, audience)),
    [cards, audience],
  );
  const filteredCards = useMemo(
    () => filterDiscoveryCards(cards, { query, side, scope, sort }, audience),
    [cards, query, side, scope, sort, audience],
  );
  const sections = useMemo(
    () => buildSections(filteredCards, audience, copy),
    [filteredCards, audience, copy],
  );

  const loading = listings === null && briefs === null;
  const allUnavailable = failedSources.length === 2 && visibleCards.length === 0;
  const filtersActive = query.trim() !== '' || side !== 'all' || scope !== 'all' || sort !== 'newest';
  const emptyMarket = !loading && !allUnavailable && visibleCards.length === 0;
  const emptyFilter = !loading && !allUnavailable && visibleCards.length > 0 && filteredCards.length === 0;
  const resultCopy = (filteredCards.length === 1 ? copy.resultsOne : copy.resultsMany).replace(
    '{n}',
    String(filteredCards.length),
  );

  function clearFilters() {
    setQuery('');
    setSide('all');
    setScope('all');
    setSort('newest');
  }

  return (
    <FullBleed>
      {isAuthenticated ? (
        <PageTour
          id={onBusinessTrack ? MARKET_BIZ_TOUR_ID : MARKET_TOUR_ID}
          steps={buildMarketSteps(
            onBusinessTrack ? 'business' : 'person',
            sections.filter((section) => section.cards.length > 0).map((section) => section.key),
          )}
        />
      ) : null}

      <Band tone="dark" compact overlay={<GridOverlay />}>
        <SectionTag tone="dark" dot="live">
          {copy.heroTag}
        </SectionTag>
        <HeroHeadline size="sm">
          {copy.heroHeadlinePart1}{' '}
          <br className="hidden md:inline" />
          {copy.heroHeadlinePart2Prefix}
          <Accent>{copy.heroAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 max-w-[56ch] text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
          {copy.heroBody}
        </p>
        <DiscoveryNav active="market" tone="dark" />
        <div className="mt-6 flex flex-wrap gap-3">
          <CTAPill href="/buyer">{withoutTrailingArrow(homeHero.postRequestCta)}</CTAPill>
          <CTAPill
            href={onBusinessTrack ? '/supply' : '/seller'}
            variant="secondary"
            tone="dark"
          >
            {withoutTrailingArrow(homeHero.postOfferCta)}
          </CTAPill>
        </div>
      </Band>

      <Band tone="light" compact>
        <div className="mt-2 border-b border-[var(--lp-border-light)] pb-6 pt-6 sm:pt-8">
          <SectionTag>{copy.findTag}</SectionTag>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] lg:items-end">
            <div>
              <h2 className="max-w-[18ch] font-sans text-[clamp(1.65rem,3vw,2.5rem)] font-extrabold uppercase leading-[0.98] tracking-[-0.025em] text-[var(--lp-dark)]">
                {copy.findTitle}
              </h2>
              <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {copy.findBody}
              </p>
            </div>
            <p
              className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] lg:text-end"
              aria-live="polite"
            >
              {refreshing && !loading ? `${copy.refreshing} · ` : ''}
              {!loading ? resultCopy : ''}
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
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="form-input min-h-12 w-full ps-11 pe-4"
                style={{ paddingInlineStart: 44 }}
                maxLength={120}
              />
            </span>
          </label>

          <div className="mt-5 grid gap-5 xl:grid-cols-[auto_auto_1fr] xl:items-end">
            <FilterGroup label={copy.typeFilterLabel}>
              <FilterButton pressed={side === 'all'} onClick={() => setSide('all')}>
                {copy.filters.all}
              </FilterButton>
              <FilterButton pressed={side === 'request'} onClick={() => setSide('request')}>
                {copy.filters.briefs}
              </FilterButton>
              <FilterButton pressed={side === 'offer'} onClick={() => setSide('offer')}>
                {copy.filters.offers}
              </FilterButton>
            </FilterGroup>

            <FilterGroup label={copy.scopeFilterLabel}>
              <FilterButton pressed={scope === 'all'} onClick={() => setScope('all')}>
                {copy.scope.all}
              </FilterButton>
              <FilterButton pressed={scope === 'services'} onClick={() => setScope('services')}>
                {copy.scope.services}
              </FilterButton>
              <FilterButton pressed={scope === 'business'} onClick={() => setScope('business')}>
                {copy.scope.business}
              </FilterButton>
            </FilterGroup>

            <div className="flex flex-wrap items-end gap-3 xl:justify-end">
              <FilterGroup label={copy.sortFilterLabel}>
                <FilterButton pressed={sort === 'newest'} onClick={() => setSort('newest')}>
                  {copy.sort.newest}
                </FilterButton>
                <FilterButton pressed={sort === 'price-asc'} onClick={() => setSort('price-asc')}>
                  {copy.sort.lowestPrice}
                </FilterButton>
                <FilterButton pressed={sort === 'price-desc'} onClick={() => setSort('price-desc')}>
                  {copy.sort.highestPrice}
                </FilterButton>
              </FilterGroup>
              {filtersActive ? (
                <Button type="button" variant="ghost" onClick={clearFilters} className="shrink-0">
                  {copy.clearFilters}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {failedSources.length > 0 ? (
          <DegradedNotice
            message={partialFailureCopy(failedSources, copy)}
            retryLabel={copy.retry}
            onRetry={() => setReloadToken((value) => value + 1)}
          />
        ) : null}

        {loading ? <MarketSkeleton /> : null}

        {emptyMarket ? (
          <PageCard>
            <div className="px-6 py-10 sm:px-8 sm:py-12">
              <SectionTag>{copy.emptyAllTag}</SectionTag>
              <h2 className="mt-4 max-w-[20ch] font-sans text-[24px] font-extrabold uppercase leading-tight tracking-[-0.02em] text-[var(--lp-dark)]">
                {copy.emptyAllBody}
              </h2>
              <div className="mt-6 flex flex-wrap gap-4">
                <DiscoveryAction href="/buyer" label={withoutTrailingArrow(homeHero.postRequestCta)} />
                <DiscoveryAction
                  href={onBusinessTrack ? '/supply' : '/seller'}
                  label={withoutTrailingArrow(homeHero.postOfferCta)}
                />
              </div>
            </div>
          </PageCard>
        ) : null}

        {emptyFilter ? (
          <PageCard>
            <div className="px-6 py-10 sm:px-8 sm:py-12">
              <SectionTag>{copy.emptyFilteredTag}</SectionTag>
              <h2 className="mt-4 font-sans text-[24px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
                {copy.emptyFilteredTitle}
              </h2>
              <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {copy.emptyFilteredBody}
              </p>
              <Button type="button" variant="outline" onClick={clearFilters} className="mt-6">
                {copy.clearFilters}
              </Button>
            </div>
          </PageCard>
        ) : null}

        {!loading && !allUnavailable && filteredCards.length > 0 ? (
          <div className="space-y-10">
            {sections
              .filter((section) => section.cards.length > 0)
              .map((section) => (
                <section key={section.key} data-guide={`market-${section.key}`}>
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <h2 className="font-sans text-[19px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
                      {section.title}
                      <span className="ms-2 mono text-[11px] font-bold tabular-nums text-[var(--lp-text-muted)]">
                        {section.cards.length}
                      </span>
                    </h2>
                    <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] sm:max-w-[48ch] sm:text-end">
                      {section.note}
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {section.cards.map((card) => (
                      <MarketCard
                        key={`${card.side}-${card.id}`}
                        card={card}
                        copy={copy.card}
                        variant={section.variant}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        ) : null}
      </Band>
    </FullBleed>
  );
}

function buildSections(
  cards: DiscoveryCard[],
  audience: DiscoveryAudience,
  copy: Messages['listingsBrowse'],
): MarketSection[] {
  const personal = cards.filter((card) => discoveryRail(card) === 'personal');
  const hiring = cards.filter((card) => discoveryRail(card) === 'hiring');
  const business = cards.filter((card) => discoveryRail(card) === 'business');

  if (audience === 'business') {
    return [
      {
        key: 'b2b',
        title: copy.sections.businessTitle,
        note: copy.sections.businessNote,
        cards: business,
        variant: 'default',
      },
      {
        key: 'hiring',
        title: copy.sections.hiringTitle,
        note: copy.sections.hiringNote,
        cards: hiring,
        variant: 'hiring',
      },
    ];
  }

  return [
    {
      key: 'p2p',
      title: copy.sections.personalTitle,
      note: copy.sections.personalNote,
      cards: personal,
      variant: 'default',
    },
    {
      key: 'hiring',
      title: copy.sections.hiringTitle,
      note: copy.sections.hiringNote,
      cards: hiring,
      variant: 'hiring',
    },
    {
      key: 'b2b',
      title: copy.sections.businessTitle,
      note: audience === 'person' ? copy.sections.businessViewOnlyNote : copy.sections.businessNote,
      cards: business,
      variant: 'summary',
    },
  ];
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </legend>
      <div className="mt-2 flex max-w-full gap-1 overflow-x-auto pb-1">{children}</div>
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
      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[8px] border px-3 mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
      style={{
        borderColor: pressed ? 'var(--lp-control-active-border)' : 'var(--lp-border-light)',
        background: pressed ? 'var(--lp-control-active-bg)' : 'var(--lp-card)',
        color: pressed ? 'var(--lp-control-active-ink)' : 'var(--lp-text-sub)',
      }}
    >
      {children}
    </button>
  );
}

function DegradedNotice({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 border-s-[3px] border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="max-w-[70ch] text-[13px] leading-relaxed text-[var(--lp-dark)]">{message}</p>
      <Button type="button" variant="outline" onClick={onRetry} className="shrink-0 self-start sm:self-auto">
        {retryLabel}
      </Button>
    </div>
  );
}

function MarketSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-5 h-6 w-3/4" />
          <SkeletonText lines={2} className="mt-4" />
          <Skeleton className="mt-6 h-11 w-full" />
        </div>
      ))}
    </div>
  );
}

function DiscoveryAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-2 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-dark)] transition-colors hover:text-[var(--lp-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
    >
      {label}
      <CtaArrow />
    </Link>
  );
}

function MarketCard({
  card,
  copy,
  variant,
}: {
  card: DiscoveryCard;
  copy: Messages['listingsBrowse']['card'];
  variant: CardVariant;
}) {
  const isSummary = variant === 'summary';
  const statusLabel = card.side === 'offer' ? copy.statusOffer : copy.statusRequest;
  const partyLabel =
    card.side === 'offer'
      ? card.partyKind === 'business'
        ? copy.businessSeller
        : copy.individualSeller
      : card.partyKind === 'business'
        ? copy.businessBuyer
        : copy.individualBuyer;
  const availability = (card.side === 'offer'
    ? copy.availableUntilTemplate
    : copy.dueTemplate
  ).replace('{time}', relativeTime(card.availableUntil));
  const bidCopy =
    card.side === 'request'
      ? card.bidsCount === 0
        ? copy.metaAwaitingBids
        : card.bidsCount === 1
          ? copy.metaBidOne
          : copy.metaBidsTemplate.replace('{n}', String(card.bidsCount))
      : null;

  const cardStyle = {
    background: 'var(--lp-card)',
    border: '1px solid var(--lp-border-light)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 5,
  } as const;

  const content = (
    <>
      <div className="space-y-3 px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            <span aria-hidden className="h-[6px] w-[6px] bg-current" />
            {statusLabel}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums">
            {relativeTime(card.postedAt)}
          </span>
        </div>
        <h3 className="line-clamp-2 font-sans text-[19px] font-extrabold leading-tight tracking-[-0.015em] text-[var(--lp-dark)]">
          {card.title}
        </h3>
        {card.body ? (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
            {card.body}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mono text-[9px] uppercase tracking-[0.11em] text-[var(--lp-text-muted)]">
          <span>{availability}</span>
          {bidCopy ? <span>{bidCopy}</span> : null}
          {card.matchedBefore ? <span>{copy.matchedBefore}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--lp-border-light)] bg-[var(--lp-light)] px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-sans text-[22px] font-extrabold leading-none tracking-[-0.01em] text-[var(--lp-dark)] tabular-nums">
            {formatUsdc(card.priceUsdc, { withSuffix: false })}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            {copy.priceUnitTemplate.replace(
              '{label}',
              card.side === 'offer' ? copy.priceLabelAsking : copy.priceLabelBudget,
            )}
          </span>
        </div>
        <div className="flex min-h-7 items-center gap-2">
          <span className="mono text-[9px] uppercase tracking-[0.11em] text-[var(--lp-text-muted)]">
            {partyLabel}
            {card.partyIsYou ? copy.selfSuffix : ''}
          </span>
          {card.side === 'offer' && /^0x[a-fA-F0-9]{40}$/.test(card.partyAddress) ? (
            <ReputationBadge address={card.partyAddress} size="sm" />
          ) : null}
        </div>
      </div>
    </>
  );

  if (isSummary) {
    return (
      <article className="relative block overflow-hidden" style={{ ...cardStyle, opacity: 0.92 }}>
        {content}
      </article>
    );
  }

  return (
    <Link
      href={card.href}
      className="group relative block overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.10)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_28px_60px_-22px_rgba(0,0,0,0.20)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)] motion-reduce:hover:translate-y-0"
      style={cardStyle}
    >
      {content}
    </Link>
  );
}

function partialFailureCopy(
  failures: SourceName[],
  copy: Messages['listingsBrowse'],
): string {
  if (failures.length === 2) return copy.partial.all;
  return failures[0] === 'offers' ? copy.partial.offers : copy.partial.requests;
}
