'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { stageOf } from '@/features/deals/components/DirectDealList';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';
import { tradeHubSummary } from '../tradeHub';

type TradeDeskProps = { business?: boolean };

/// Trade: the three ways into a deal, then what you already have going, so the
/// page you start trades from is also the page you come back to.
export function TradeDesk({ business = false }: TradeDeskProps) {
  const { locale } = useLocale();
  const nav = useTranslations().nav;
  const entryCopy = TRADE_ENTRY_COPY[locale];
  const copy = entryCopy.desk;
  const hub = copy.hub;
  const routes = tradeEntryRoutes(business);
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

  const paths = [
    { href: routes.buy, title: copy.need, body: copy.needBody, icon: <SearchIcon /> },
    { href: routes.sell, title: copy.sell, body: copy.sellBody, icon: <TagIcon /> },
    { href: routes.agreement, title: entryCopy.agreement, body: copy.bringAgreementBody, icon: <AgreementIcon /> },
  ];

  return (
    <div className="mx-auto w-full max-w-[760px] pb-12" data-ui="trade-intent">
      <h1 id="trade-desk-heading" className="text-[32px] font-bold leading-tight tracking-[-0.03em] text-[var(--lp-dark)]">{nav.trades}</h1>
      <p className="mt-2 max-w-[56ch] text-[16px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{entryCopy.body}</p>

      <ul className="mt-6 overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]" aria-label={copy.question}>
        {paths.map((path) => (
          <li key={path.href} className="border-b border-[var(--lp-border-light)] last:border-b-0">
            <Link href={path.href} className="group flex min-h-[76px] items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--lp-light)] text-[var(--lp-dark)]">{path.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold text-[var(--lp-dark)]">{path.title}</span>
                <span className="mt-0.5 block text-[15px] font-medium text-[var(--lp-text-sub)]">{path.body}</span>
              </span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="trade-hub-yours" className="mt-10">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <h2 id="trade-hub-yours" className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{hub.yours}</h2>
          <Link href="/activity" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent-on-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
            {copy.allActivity}
            <Chevron small />
          </Link>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 sm:gap-3">
          <Tile
            href="/profile/open-deals"
            label={hub.trades}
            value={fetchState === 'success' ? summary.trades.active : null}
            note={summary.trades.yourMove > 0 ? fill(hub.yourMove, summary.trades.yourMove) : hub.noMove}
            flag={summary.trades.yourMove > 0}
          />
          <Tile
            href="/p2p/requests"
            label={hub.requests}
            value={requests.isSuccess ? summary.requests.open : null}
            note={summary.requests.open === 0 ? hub.noneOpen : summary.requests.offers === 0 ? hub.noOffers : summary.requests.offers === 1 ? hub.offersInOne : fill(hub.offersIn, summary.requests.offers)}
            flag={summary.requests.offers > 0}
          />
          <Tile
            href="/p2p/offers"
            label={hub.offers}
            value={listings.isSuccess ? summary.offers.live : null}
            note={summary.offers.live > 0 ? hub.live : hub.noneLive}
          />
        </div>
      </section>
    </div>
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

function Chevron({ small = false }: { small?: boolean }) {
  const size = small ? 14 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[var(--lp-text-sub)] transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function SearchIcon() {
  return <Icon><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Icon>;
}

function TagIcon() {
  return <Icon><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.2 7.2a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.2-7.2a1 1 0 0 1-.3-.7z" /><circle cx="8" cy="8" r="1.4" /></Icon>;
}

function AgreementIcon() {
  return <Icon><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3.5V8h4.5" /><path d="m9 14 2 2 4-4" /></Icon>;
}
