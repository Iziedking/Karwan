'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { stageOf } from '@/features/deals/components/DirectDealList';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { YourOffers, YourRequests } from '@/features/home/components/TradeLists';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';
import { tradeHubSummary } from '@/features/home/tradeHub';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { marketViewHref, type YoursList } from '../marketQuery';

/// Your trades, inside the market: open deals, your requests and your offers,
/// each opening its own list. The same place you start trades from is the
/// place you come back to.
export function YourTrades({ list }: { list: YoursList }) {
  if (list === 'requests') return <YourRequests />;
  if (list === 'offers') return <YourOffers />;
  return <Summary />;
}

function Summary() {
  const { locale } = useLocale();
  const copy = TRADE_ENTRY_COPY[locale].desk;
  const hub = copy.hub;
  const me = useAuth().address?.toLowerCase() ?? '';
  const { deals, fetchState } = useDirectDeals();
  const requests = useQuery({ queryKey: ['search', 'myRequests', me], queryFn: () => api.buyer(me).then((r) => r.jobs), enabled: !!me, staleTime: 15_000 });
  const listings = useQuery({ queryKey: ['trade-hub', 'listings', me], queryFn: () => api.listingsForSeller(me).then((r) => r.listings), enabled: !!me, staleTime: 15_000 });

  const summary = tradeHubSummary({
    me,
    trades: deals.map((deal) => ({ stage: stageOf(deal), isBuyer: deal.buyer.toLowerCase() === me })),
    requests: requests.data ?? [],
    listings: listings.data ?? [],
    now: Date.now(),
  });
  const fill = (template: string, n: number) => template.replace('{n}', String(n));
  const previous = useTranslations().previousEscrow;
  const earlier = deals.filter((deal) => deal.previousEscrow).length;

  return (
    <section aria-labelledby="market-yours" className="mt-6">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <h2 id="market-yours" className="text-[20px] font-medium tracking-[-0.02em] text-[var(--lp-dark)]">{hub.yours}</h2>
        <Link href="/activity" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent-on-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
          {copy.allActivity}
          <Chevron small />
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 sm:gap-3">
        <Tile
          href="/deals"
          label={hub.trades}
          value={fetchState === 'success' ? summary.trades.active : null}
          note={summary.trades.yourMove > 0 ? fill(hub.yourMove, summary.trades.yourMove) : hub.noMove}
          flag={summary.trades.yourMove > 0}
        />
        <Tile
          href={marketViewHref('yours', 'requests')}
          label={hub.requests}
          value={requests.isSuccess ? summary.requests.open : null}
          note={summary.requests.open === 0 ? hub.noneOpen : summary.requests.offers === 0 ? hub.noOffers : summary.requests.offers === 1 ? hub.offersInOne : fill(hub.offersIn, summary.requests.offers)}
          flag={summary.requests.offers > 0}
        />
        <Tile
          href={marketViewHref('yours', 'offers')}
          label={hub.offers}
          value={listings.isSuccess ? summary.offers.live : null}
          note={summary.offers.live > 0 ? hub.live : hub.noneLive}
        />
      </div>
      {earlier > 0 ? (
        <Link href="/legacy" className="mt-2 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
          {fill(previous.link, earlier)}
          <Chevron small />
        </Link>
      ) : null}
    </section>
  );
}

/// One count you can open. On a phone it is a row, label and note on the left
/// and the count on the right; from tablet up it is a tile with the count under
/// the label. While the count loads the number pulses and the note stays hidden,
/// so nothing claims "none" early.
function Tile({ href, label, value, note, flag = false }: { href: string; label: string; value: number | null; note: string; flag?: boolean }) {
  return (
    <Link href={href} className="group grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-3 transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:flex sm:min-h-[124px] sm:flex-col sm:items-stretch sm:p-5">
      <span className="col-start-1 row-start-1 flex items-center justify-between gap-2 text-[14px] font-semibold text-[var(--lp-text-sub)]">
        {label}
        <span className="hidden sm:block"><Chevron small /></span>
      </span>
      {value === null ? (
        <span aria-hidden className="col-start-2 row-span-2 row-start-1 block h-8 w-9 rounded-[8px] bg-[var(--lp-light)] motion-safe:animate-pulse sm:mt-2 sm:h-9 sm:w-10" />
      ) : (
        <>
          <span className="col-start-2 row-span-2 row-start-1 block text-[28px] font-bold leading-none tabular-nums tracking-[-0.03em] text-[var(--lp-dark)] sm:mt-2 sm:text-[32px]">{value}</span>
          <span className="col-start-1 row-start-2 mt-0.5 flex min-w-0 items-center gap-2 text-[14px] font-medium text-[var(--lp-text-sub)] sm:mt-auto sm:pt-3">
            {flag ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--lp-accent)]" /> : null}
            <span className="truncate">{note}</span>
          </span>
        </>
      )}
      <span className="col-start-3 row-span-2 row-start-1 sm:hidden"><Chevron small /></span>
    </Link>
  );
}

export function Chevron({ small = false }: { small?: boolean }) {
  const size = small ? 14 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[var(--lp-text-sub)] transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
