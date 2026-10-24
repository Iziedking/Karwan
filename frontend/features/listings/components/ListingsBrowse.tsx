'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type Listing, type MarketplaceBrief } from '@/core/api';
import { FilterButton, FilterGroup, SortMenu } from '@/features/discovery/components/FilterBar';
import {
  buildDiscoveryCards,
  discoveryRail,
  filterDiscoveryCards,
  isVisibleToAudience,
  orderNoteKey,
  type DiscoveryAudience,
  type DiscoveryCard,
  type DiscoveryScope,
  type DiscoverySide,
  type DiscoverySort,
} from '@/features/discovery/model';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { Hint } from '@/shared/components/Hint';
import { photoSrc } from '@/features/listings/photos';
import { Icon } from '@/shared/components/Icon';
import { Skeleton, SkeletonText } from '@/shared/components/Skeleton';
import { Band, FullBleed } from '@/shared/components/Bands';
import { PageTour } from '@/shared/guide/PageTour';
import { MARKET_BIZ_TOUR_ID, MARKET_TOUR_ID, buildMarketSteps } from '@/shared/guide/tours';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { marketSectionPlan } from '@/features/market/marketSections';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import { formatUsdc, relativeTime } from '@/shared/utils/format';
import { pageItems, pageWindow } from '../pagination';

/// Counts are real listings only. Example stock still shows, labelled, but a
/// number that included it would overstate the market.
const realCount = (cards: ReadonlyArray<{ example?: boolean }>) => cards.filter((card) => !card.example).length;

type CardVariant = 'default' | 'summary' | 'hiring';
type SourceName = 'offers' | 'requests';

const quietAction = 'inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--tint)] px-5 text-[14px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] hover:bg-[color-mix(in_srgb,var(--tint)_92%,var(--ink))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]';
const clearAction = 'inline-flex min-h-11 items-center rounded-full px-2 text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]';

interface MarketSection {
  key: string;
  title: string;
  note: string;
  cards: DiscoveryCard[];
  variant: CardVariant;
}

/// The market's Find part (view 17). `action` sits beside the heading (the one
/// primary action, Start a trade) and `beforeSearch` holds Your trades.
export function ListingsBrowse({
  initialScope = 'all',
  action,
  beforeSearch,
}: { initialScope?: DiscoveryScope; action?: ReactNode; beforeSearch?: ReactNode } = {}) {
  const translations = useTranslations();
  const copy = translations.listingsBrowse;
  const { address, isAuthenticated } = useAuth();
  const { isBusinessWorkspace } = useWorkspaceContext();
  const onBusinessTrack = isAuthenticated && isBusinessWorkspace;
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
  const [scope, setScope] = useState<DiscoveryScope>(initialScope);
  const [sort, setSort] = useState<DiscoverySort>('newest');
  const [pages, setPages] = useState<Record<string, number>>({});

  // A new search or filter is a new list, so it starts on its first page.
  useEffect(() => {
    setPages({});
  }, [query, side, scope, sort, audience]);

  function goToPage(sectionKey: string, page: number) {
    setPages((current) => ({ ...current, [sectionKey]: page }));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`market-${sectionKey}`)?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }

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

  function clearFilters() {
    setQuery('');
    setSide('all');
    setScope('all');
    setSort('newest');
  }

  return (
    <div className="product-surface" data-testid="market" aria-busy={refreshing}>
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

      <Band tone="light" compact>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 sm:pt-3">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">
            {copy.heroTitle}
          </h1>
          {action}
        </div>
        {beforeSearch}

        <div className="py-6" role="search" aria-label={copy.searchLabel}>
          <label className="block">
            <span className="sr-only">{copy.searchLabel}</span>
            <span className="relative block">
              <Icon name="search" size={20} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[var(--ink-secondary)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="min-h-[52px] w-full rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] ps-12 pe-5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--action)]"
                maxLength={120}
              />
            </span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <FilterGroup label={copy.typeFilterLabel} segmented>
              <FilterButton segmented pressed={side === 'all'} onClick={() => setSide('all')}>
                {copy.filters.all} <span className="tabular-nums">{loading ? <Skeleton className="h-4 w-4" /> : realCount(visibleCards)}</span>
              </FilterButton>
              <FilterButton segmented pressed={side === 'request'} onClick={() => setSide('request')}>
                {copy.filters.briefs} <span className="tabular-nums">{loading ? <Skeleton className="h-4 w-4" /> : realCount(visibleCards.filter((card) => card.side === 'request'))}</span>
              </FilterButton>
              <FilterButton segmented pressed={side === 'offer'} onClick={() => setSide('offer')}>
                {copy.filters.offers} <span className="tabular-nums">{loading ? <Skeleton className="h-4 w-4" /> : realCount(visibleCards.filter((card) => card.side === 'offer'))}</span>
              </FilterButton>
            </FilterGroup>

            {/* Market and sort wrap as one row, sort at its end, so the menu never
                lands on a line of its own. On a phone that row takes a full line
                under the counts instead of squeezing beside them. */}
            <div data-market-filters className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 sm:flex-1 sm:basis-0">
              {/* Market narrows the list when one is on; pressing it again shows every market. */}
              <FilterGroup label={copy.scopeFilterLabel}>
                <FilterButton pressed={scope === 'services'} onClick={() => setScope(scope === 'services' ? 'all' : 'services')}>
                  {copy.scope.services}
                </FilterButton>
                <FilterButton pressed={scope === 'business'} onClick={() => setScope(scope === 'business' ? 'all' : 'business')}>
                  {copy.scope.business}
                </FilterButton>
              </FilterGroup>

              <div className="ms-auto flex items-center gap-2">
                {filtersActive ? (
                  <button type="button" onClick={clearFilters} className={clearAction}>
                    {copy.clearFilters}
                  </button>
                ) : null}
                <SortMenu
                  label={copy.sortFilterLabel}
                  value={sort}
                  options={[
                    { value: 'newest', label: copy.sort.newest },
                    { value: 'price-asc', label: copy.sort.lowestPrice },
                    { value: 'price-desc', label: copy.sort.highestPrice },
                  ]}
                  onChange={setSort}
                />
                <Hint side="bottom" align="end"><span data-market-order>{copy.order[orderNoteKey(sort)]}</span></Hint>
              </div>
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
          <div className="border-t border-[var(--line)] py-8 sm:py-10">
            <h2 className="text-[17px] font-semibold leading-tight text-[var(--ink)]">
              {copy.emptyAllTag}
            </h2>
            <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">
              {copy.emptyAllBody}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/buyer" className={quietAction}>
                {copy.emptyPostRequest}
              </Link>
              <Link href="/seller#post-listing" className={quietAction}>
                {copy.emptyPublishOffer}
              </Link>
            </div>
          </div>
        ) : null}

        {emptyFilter ? (
          <div className="border-t border-[var(--line)] py-8 sm:py-10">
            <h2 className="text-[17px] font-semibold leading-tight text-[var(--ink)]">
              {copy.emptyFilteredTitle}
            </h2>
            <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">
              {copy.emptyFilteredBody}
            </p>
            <button type="button" onClick={clearFilters} className={`${quietAction} mt-6`}>
              {copy.clearFilters}
            </button>
          </div>
        ) : null}

        {!loading && !allUnavailable && filteredCards.length > 0 ? (
          <div className="space-y-10">
            {sections
              .filter((section) => section.cards.length > 0)
              .map((section) => {
                const paged = pageItems(section.cards, pages[section.key] ?? 1);
                return (
                  <section key={section.key} id={`market-${section.key}`} data-guide={`market-${section.key}`} className="scroll-mt-24">
                    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <h2 className="text-[17px] font-semibold text-[var(--ink)]">
                        {section.title}
                        <span className="ms-2 text-[14px] font-normal tabular-nums text-[var(--ink-secondary)]">
                          {realCount(section.cards)}
                        </span>
                      </h2>
                      <p className="text-[14px] text-[var(--ink-secondary)] sm:max-w-[48ch] sm:text-end font-medium">{section.note}</p>
                    </div>
                    <div className="market-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {paged.items.map((card) => (
                        <MarketCard key={`${card.side}-${card.id}`} card={card} copy={copy.card} offerCopy={translations.offers} variant={section.variant} />
                      ))}
                    </div>
                    {paged.pageCount > 1 ? (
                      <Pager
                        page={paged.page}
                        pageCount={paged.pageCount}
                        range={copy.pager.range
                          .replace('{from}', String(paged.from))
                          .replace('{to}', String(paged.to))
                          .replace('{total}', String(paged.total))}
                        copy={copy.pager}
                        onPage={(page) => goToPage(section.key, page)}
                      />
                    ) : null}
                  </section>
                );
              })}
          </div>
        ) : null}
      </Band>
    </FullBleed>
    </div>
  );
}

function buildSections(
  cards: DiscoveryCard[],
  audience: DiscoveryAudience,
  copy: Messages['listingsBrowse'],
): MarketSection[] {
  const byKey = {
    p2p: { title: copy.sections.personalTitle, note: copy.sections.personalNote, cards: cards.filter((card) => discoveryRail(card) === 'personal') },
    hiring: { title: copy.sections.hiringTitle, note: copy.sections.hiringNote, cards: cards.filter((card) => discoveryRail(card) === 'hiring') },
    b2b: {
      title: copy.sections.businessTitle,
      note: audience === 'person' ? copy.sections.businessViewOnlyNote : copy.sections.businessNote,
      cards: cards.filter((card) => discoveryRail(card) === 'business'),
    },
  };
  return marketSectionPlan(audience).map(({ key, variant }) => ({ key, variant, ...byKey[key] }));
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
      className="mb-6 flex flex-col gap-3 rounded-[20px] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <p className="max-w-[70ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">{message}</p>
      <button type="button" onClick={onRetry} className={`${quietAction} shrink-0 self-start sm:self-auto`}>
        {retryLabel}
      </button>
    </div>
  );
}

function MarketSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-5 h-6 w-3/4" />
          <SkeletonText lines={2} className="mt-4" />
          <Skeleton className="mt-6 h-11 w-full" />
        </div>
      ))}
    </div>
  );
}

function Pager({
  page,
  pageCount,
  range,
  copy,
  onPage,
}: {
  page: number;
  pageCount: number;
  range: string;
  copy: Messages['listingsBrowse']['pager'];
  onPage: (page: number) => void;
}) {
  const step =
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-4 text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)] disabled:cursor-not-allowed disabled:opacity-40';
  const neutral = 'bg-[var(--tint)] text-[var(--ink)]';
  return (
    <nav aria-label={copy.label} className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-[14px] tabular-nums text-[var(--ink-secondary)] font-medium" aria-live="polite">
        {range}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={`${step} ${neutral}`} onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <Icon name="chevron-left" size={16} directional />
          <span className="ms-1.5 hidden sm:inline">{copy.previous}</span>
          <span className="sr-only sm:hidden">{copy.previous}</span>
        </button>
        <ol className="flex items-center gap-1.5">
          {pageWindow(page, pageCount).map((n, i) =>
            n === 'gap' ? (
              <li key={`gap-${i}`} aria-hidden className="hidden px-1 text-[14px] text-[var(--ink-secondary)] sm:block font-medium">
                …
              </li>
            ) : (
              <li key={n} className={n === page ? '' : 'hidden sm:block'}>
                <button
                  type="button"
                  onClick={() => onPage(n)}
                  aria-current={n === page ? 'page' : undefined}
                  aria-label={copy.page.replace('{n}', String(n))}
                  className={`${step} tabular-nums ${n === page ? 'bg-[var(--ink)] text-[var(--canvas)]' : neutral}`}
                >
                  {n}
                </button>
              </li>
            ),
          )}
        </ol>
        <button type="button" className={`${step} ${neutral}`} onClick={() => onPage(page + 1)} disabled={page >= pageCount}>
          <span className="me-1.5 hidden sm:inline">{copy.next}</span>
          <span className="sr-only sm:hidden">{copy.next}</span>
          <Icon name="chevron-right" size={16} directional />
        </button>
      </div>
    </nav>
  );
}

function MarketCard({
  card,
  copy,
  offerCopy,
  variant,
}: {
  card: DiscoveryCard;
  copy: Messages['listingsBrowse']['card'];
  offerCopy: Messages['offers'];
  variant: CardVariant;
}) {
  const { locale } = useLocale();
  const isSummary = variant === 'summary';
  const side = card.side === 'offer' ? 'offer' : 'request';
  const sideColor = `var(--color-${side})`;
  const statusLabel = card.side === 'offer' ? copy.statusOffer : copy.statusRequest;
  const partyLabel =
    card.side === 'offer'
      ? card.partyKind === 'business'
        ? copy.businessSeller
        : copy.individualSeller
      : card.partyKind === 'business'
        ? copy.businessBuyer
        : copy.individualBuyer;
  const availability = (card.side === 'offer' ? copy.availableUntilTemplate : copy.dueTemplate).replace(
    '{time}',
    relativeTime(card.availableUntil, locale),
  );
  const bidCopy =
    card.side === 'request'
      ? !card.bidsCount
        ? offerCopy.countNone
        : card.bidsCount === 1
          ? offerCopy.countOne
          : offerCopy.countMany.replace('{n}', String(card.bidsCount))
      : null;
  const facts = [availability, card.matchedBefore ? copy.matchedBefore : null].filter(
    (fact): fact is string => !!fact,
  );

  // A white card for every trade: a tinted label says which side it is, the
  // amount is the loudest line, and example stock says so up front.
  const shell = 'market-card relative flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]';
  const party = card.side === 'offer' && /^0x[a-fA-F0-9]{40}$/.test(card.partyAddress)
    ? <ReputationBadge address={card.partyAddress} appearance="text" textTemplate={copy.tierTemplate} />
    : null;

  const content = (
    <>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2 text-[14px] font-medium text-[var(--ink-secondary)]">
          <span className="flex min-w-0 items-center gap-2">
            {/* A tinted label, not a dot: the two side tones are close in light
                mode, so the label carries its own pale ground. */}
            <span className="rounded-full px-2.5 py-0.5 font-semibold" style={{ background: `var(--${side}-surface)`, color: sideColor }}>{statusLabel}</span>
            {card.example ? (
              <span className="rounded-full border border-[var(--lp-border-light)] px-2 py-0.5 text-[14px] font-semibold text-[var(--ink-secondary)]">{copy.example}</span>
            ) : null}
          </span>
          <span className="shrink-0 tabular-nums">{relativeTime(card.postedAt, locale)}</span>
        </div>
        {/* Two title lines and one body line always take the same room, so
            every card in a row keeps its footer on the same line. */}
        <div className="mt-3 flex shrink-0 gap-3">
          <div className="h-20 min-w-0 flex-1 overflow-hidden">
            <h3 dir="auto" className="line-clamp-2 text-[16px] font-semibold leading-[1.35] text-[var(--ink)]">
              {card.title}
            </h3>
            {card.body ? <p dir="auto" className="mt-1 line-clamp-1 text-[14px] leading-5 text-[var(--ink-secondary)] font-medium">{card.body}</p> : null}
          </div>
          {/* The first photo sits beside the words at the same height, so a
              row of cards keeps its footers on one line with or without one. */}
          {card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc(card.photo)} alt="" loading="lazy" className="size-20 shrink-0 rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--tint)] object-cover" />
          ) : null}
        </div>
        {/* Facts sit on fixed lines, so a separator never starts a line:
            when and where it stands, then for an offer who sells it. */}
        <div data-market-facts className="mt-auto space-y-0.5 pt-3 text-[14px] text-[var(--ink-secondary)] font-medium">
          <p className="truncate">{[...facts, card.side === 'request' ? bidCopy : null].filter(Boolean).join(' · ')}</p>
          {card.side === 'offer' ? (
            <p className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{partyLabel}{card.partyIsYou ? copy.selfSuffix : ''}</span>
              {party ? <span data-market-tier className="whitespace-nowrap"><span aria-hidden className="me-1.5">·</span>{party}</span> : null}
            </p>
          ) : null}
        </div>
      </div>
      <div data-market-footer className="mx-5 shrink-0 border-t border-[var(--lp-border-light)] py-4">
        <p className="flex items-baseline gap-1.5">
        <span className="text-[20px] font-bold leading-none tracking-[-0.02em] text-[var(--ink)] tabular-nums">
          {formatUsdc(card.priceUsdc, { withSuffix: false })}
        </span>
        <span className="whitespace-nowrap text-[14px] text-[var(--ink-secondary)] font-medium">
          {copy.priceUnitTemplate.replace('{label}', card.side === 'offer' ? copy.priceLabelAsking : copy.priceLabelBudget)}
        </span>
        </p>
      </div>
    </>
  );

  if (isSummary) {
    return (
      <article className={shell} data-market-side={card.side}>
        {content}
      </article>
    );
  }

  return (
    <Link
      href={card.href}
      data-market-side={card.side}
      className={`${shell} transition-colors hover:border-[color-mix(in_srgb,var(--lp-accent)_45%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]`}
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
