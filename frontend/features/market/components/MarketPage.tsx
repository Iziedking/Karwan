'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { DiscoveryScope } from '@/features/discovery/model';
import { BUSINESS_ACCOUNTS_OPEN } from '@/features/account/businessOpen';
import { OpenContests } from '@/features/contests/components/OpenContests';
import { OpenWorkRequests } from '@/features/work/components/OpenWorkRequests';
import { Band, FullBleed } from '@/shared/components/Bands';
import { buttonClasses } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Skeleton } from '@/shared/components/Skeleton';
import { PageTour } from '@/shared/guide/PageTour';
import { MARKET_BIZ_TOUR_ID, MARKET_TOUR_ID, buildMarketSteps } from '@/shared/guide/tours';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import type { MarketShopCopy } from '@/shared/i18n/messages/marketShop';
import { cn } from '@/shared/utils/cn';
import { formatUsdc } from '@/shared/utils/format';
import { shouldAskTradesAs } from '../entryQuestion';
import { FRESH, buyCards, sellRequests, type CategoryId } from '../marketModel';
import { parseMarketQuery, marketHref, marketViewHref, type MarketSide, type MarketView, type YoursList } from '../marketQuery';
import { useMarketOffers, useMarketRequests, useRequestFits, type MarketSource } from '../useMarketData';
import { BuySellSwitch } from './BuySellSwitch';
import { CategoryChips } from './CategoryChips';
import { EntryQuestion } from './EntryQuestion';
import { ListingCard } from './ListingCard';
import { StartTradeSheet } from './StartTradeSheet';
import { YourTrades } from './YourTrades';

const STEP = 12;
/// The most offers one page asks for (backend/src/marketplace/marketPage.ts).
const MARKET_PAGE_MAX = 240;

/// The one market (views 17 and 44): a shop with a Buy and a Sell side. Buy
/// is search, categories and photo cards; Sell is what buyers need, the
/// requests that fit you first. Side, category and search live in the address.
export function MarketPage(_initialQuery: {
  view: MarketView;
  scope: DiscoveryScope;
  list: YoursList;
  side: MarketSide;
  category: CategoryId | 'all';
  q: string;
}) {
  const {view,list} = parseMarketQuery(useSearchParams());
  if (view === 'yours') return <YourTrades list={list} />;
  return <Shop />;
}

function Shop() {
  const query = parseMarketQuery(useSearchParams());
  const {side,category,scope} = query;
  const { t: messages } = useLocale();
  const t = messages.marketShop;
  const { isAuthenticated, address } = useAuth();
  const { profile, fetchState } = useUserProfile();
  const { workspaces, isBusinessWorkspace } = useWorkspaceContext();
  const askTradesAs = shouldAskTradesAs({
    signedIn: isAuthenticated && !!address,
    hasBusinessWorkspace: workspaces.some((workspace) => workspace.kind === 'business'),
    answer: profile?.settings?.tradesAs,
    profileLoaded: fetchState === 'success' && !!profile,
    businessOpen: BUSINESS_ACCOUNTS_OPEN,
  });
  const [q, setSearchDraft] = useState(query.q);
  useEffect(() => {
    setSearchDraft(current => current.trim() === query.q ? current : query.q);
  }, [query.q]);

  function updateFilters(change: Partial<ReturnType<typeof parseMarketQuery>>) {
    const current = parseMarketQuery(new URLSearchParams(window.location.search));
    const href = marketHref({ ...current, ...change }) + window.location.hash;
    if (window.location.pathname + window.location.search + window.location.hash !== href) {
      // Next merges its router state when handling a native URL update.
      // Passing its private __NA marker would bypass that update.
      window.history.replaceState(null, '', href);
    }
  }
  const setSide = (next: MarketSide) => updateFilters({ side: next });
  const setCategory = (next: CategoryId | 'all') => updateFilters({ category: next });
  const setQ = (next: string) => { setSearchDraft(next); updateFilters({ q: next }); };

  return (
    <div className="product-surface" data-testid="market">
      <FullBleed>
        {isAuthenticated ? <PageTour id={isBusinessWorkspace ? MARKET_BIZ_TOUR_ID : MARKET_TOUR_ID} steps={buildMarketSteps(isBusinessWorkspace ? 'business' : 'person')} /> : null}
        <Band tone="light" compact>
          <header className="pt-2 sm:pt-3">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{t.heroTitle}</h1>
            <p className="mt-1.5 max-w-[56ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">{t.heroBody}</p>
          </header>
          {askTradesAs && address ? <div className="mt-4"><EntryQuestion address={address} /></div> : null}
          <div className="mt-5 max-w-[480px]">
            <BuySellSwitch value={side} onChange={setSide} />
          </div>
          {side === 'buy' ? (
            <BuySide scope={scope} category={category} setCategory={setCategory} q={q} setQ={setQ} />
          ) : (
            <SellSide />
          )}
        </Band>
      </FullBleed>
    </div>
  );
}

function Notice({ failed, retry, t }: { failed: MarketSource[]; retry: () => void; t: MarketShopCopy }) {
  return (
    <div role="status" className="mt-6 flex flex-col gap-3 rounded-[20px] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px] text-[var(--ink-secondary)]" data-failed={failed.join(' ')}>{t.loadError}</p>
      <button type="button" onClick={retry} className={buttonClasses({ variant: 'outline', size: 'sm' })}>{t.retry}</button>
    </div>
  );
}

function BuySide({
  scope,
  category,
  setCategory,
  q,
  setQ,
}: {
  scope: DiscoveryScope;
  category: CategoryId | 'all';
  setCategory: (next: CategoryId | 'all') => void;
  q: string;
  setQ: (next: string) => void;
}) {
  const { t: messages } = useLocale();
  const t = messages.marketShop;
  const { isAuthenticated } = useAuth();
  const [seeAll, setSeeAll] = useState(false);
  const [shown, setShown] = useState(STEP);
  const [startOpen, setStartOpen] = useState(false);
  const narrowed = category !== 'all' || q.trim() !== '' || scope === 'business';
  const full = narrowed || seeAll;
  const offers = useMarketOffers({ q, category, scope, limit: full ? shown : FRESH });
  // The server already narrowed the page; narrowing again costs nothing and
  // keeps the page right against a server that sends every offer.
  const { fresh, all } = useMemo(() => buyCards(offers.cards, { q, category, scope }), [offers.cards, q, category, scope]);
  const matched = offers.total ?? all.length;
  const visible = full ? all.slice(0, shown) : fresh;
  const loading = offers.loading;
  const title = category !== 'all' ? t.categories[category] : q.trim() ? t.results : t.newOnKarwan;

  useEffect(() => setShown(STEP), [q, category, scope, seeAll]);

  return (
    <>
      <div className="mt-4 max-w-[640px]" role="search" aria-label={t.search} data-guide="market-search">
        <label className="relative block">
          <span className="sr-only">{t.search}</span>
          <Icon name="search" size={20} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[var(--ink-secondary)]" />
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value.slice(0, 120))}
            placeholder={t.search}
            className="min-h-[52px] w-full rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] ps-12 pe-4 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--action)]"
          />
        </label>
      </div>
      <div className="mt-4" data-guide="market-categories">
        <CategoryChips value={category} onChange={setCategory} />
      </div>

      {offers.failed ? <Notice failed={['offers']} retry={offers.retry} t={t} /> : null}

      <section aria-labelledby="market-buy-heading" data-guide="market-new" aria-busy={offers.refreshing} className="mt-7">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 id="market-buy-heading" className="text-[17px] font-semibold text-[var(--ink)]">{title}</h2>
          {!full && matched > fresh.length ? (
            <button type="button" onClick={() => setSeeAll(true)} className="inline-flex min-h-11 items-center px-1 text-[14px] font-semibold text-[var(--lp-accent-on-light)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--action)]">
              {t.seeAll}
            </button>
          ) : null}
        </div>
        {loading ? (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4] w-full rounded-[20px]" />)}
          </div>
        ) : visible.length > 0 ? (
          <>
            <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((card) => <li key={card.id}><ListingCard card={card} /></li>)}
            </ul>
            {full && matched > shown && shown < MARKET_PAGE_MAX ? (
              <button type="button" onClick={() => setShown((n) => n + STEP)} className={cn(buttonClasses({ variant: 'outline', size: 'sm' }), 'mt-4')}>
                {messages.dealsPage.showMore}
              </button>
            ) : null}
          </>
        ) : (
          <div className="mt-3 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-6">
            <p className="text-[16px] font-semibold text-[var(--ink)]">{t.nothingMatches}</p>
            <p className="mt-1.5 text-[15px] text-[var(--ink-secondary)]">{t.nothingBody}</p>
            {narrowed ? (
              <button type="button" onClick={() => { setQ(''); setCategory('all'); }} className={cn(buttonClasses({ variant: 'outline', size: 'sm' }), 'mt-4')}>
                {t.clear}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="market-cant-find" className="mt-8 rounded-[20px] bg-[var(--surface)] p-5 sm:p-6">
        <h2 id="market-cant-find" className="text-[17px] font-semibold text-[var(--ink)]">{t.cantFind}</h2>
        <p className="mt-1 text-[15px] text-[var(--ink-secondary)]">{t.cantFindBody}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/buyer" className={buttonClasses({ variant: 'primary' })}>{t.postNeed}</Link>
          <button type="button" onClick={() => setStartOpen(true)} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--action)]">
            {t.dealDirect}
          </button>
          {isAuthenticated ? (
            <Link href={marketViewHref('yours', 'requests')} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--action)]">
              {t.yourRequests}
            </Link>
          ) : null}
        </div>
      </section>
      <StartTradeSheet open={startOpen} onClose={() => setStartOpen(false)} />
    </>
  );
}

function SellSide() {
  const { locale, t: messages } = useLocale();
  const t = messages.marketShop;
  const { isAuthenticated } = useAuth();
  const { cards, loading, failed, retry } = useMarketRequests();
  const fits = useRequestFits(true);
  const requests = useMemo(() => sellRequests(cards, fits), [cards, fits]);
  const anyFit = requests.some((request) => request.fits);
  const dateOf = (ms: number) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms));
  const offers = (n: number | undefined) => (!n ? t.offersNone : n === 1 ? t.offersOne : t.offersMany.replace('{n}', String(n)));

  return (
    <>
      <Link
        href="/seller#post-listing"
        data-guide="market-sell"
        className="mt-5 flex items-center gap-4 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 transition-colors hover:border-[color-mix(in_srgb,var(--lp-accent)_45%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
      >
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)]"><Icon name="plus" size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-[var(--ink)]">{t.listWhatYouSell}</span>
          <span className="mt-0.5 block text-[14px] text-[var(--ink-secondary)]">{t.listBody}</span>
        </span>
        <Icon name="chevron-right" size={20} directional className="shrink-0 text-[var(--ink-secondary)]" />
      </Link>
      {isAuthenticated ? (
        <Link href={marketViewHref('yours', 'offers')} className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--action)]">
          {t.yourOffers}
        </Link>
      ) : null}

      {failed.includes('requests') ? <Notice failed={failed} retry={retry} t={t} /> : null}

      <section aria-labelledby="market-sell-heading" className="mt-6">
        <div className="flex min-h-11 items-baseline justify-between gap-3">
          <h2 id="market-sell-heading" className="text-[17px] font-semibold text-[var(--ink)]">{t.buyersNeed}</h2>
          {anyFit ? <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.fitsFirst}</p> : null}
        </div>
        {loading ? (
          <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-[16px]" />)}</div>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-[15px] text-[var(--ink-secondary)]">{t.noRequests}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--lp-border-light)] rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
            {requests.slice(0, 30).map((request) => (
              <li key={request.id}>
                <Link href={request.href} data-request-row data-fits={request.fits || undefined} className="block px-4 py-4 hover:bg-[var(--lp-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--action)] sm:px-5">
                  <span className="flex items-start justify-between gap-3">
                    <span dir="auto" className="min-w-0 text-[15px] font-semibold text-[var(--ink)]">{request.title}</span>
                    {request.fits ? (
                      <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--lp-accent-on-light)]">{t.fits}</span>
                    ) : request.example ? (
                      <span className="shrink-0 rounded-full border border-[var(--lp-border-light)] px-2 py-0.5 text-[13px] font-semibold text-[var(--ink-secondary)]">{t.example}</span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[14px] text-[var(--ink-secondary)]">
                    {t.upTo.replace('{amount}', formatUsdc(request.priceUsdc, { withSuffix: false }))} · {t.neededBy.replace('{date}', dateOf(request.availableUntil))}
                  </span>
                  <span className="mt-0.5 block truncate text-[14px] text-[var(--ink-secondary)]">
                    {[request.seller?.name || (request.seller?.tag ? `@${request.seller.tag}` : null), offers(request.bidsCount)].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-6 space-y-6">
        <OpenContests />
        <OpenWorkRequests />
      </div>
    </>
  );
}
