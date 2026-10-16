'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { walletAmount } from '@/features/balances/walletFormat';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { requestTitle } from '@/features/search/requestTitle';
import { requestLineState } from '@/features/search/requestView';
import { LINE_COPY } from '@/features/search/requestLineCopy';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { Icon } from '@/shared/components/Icon';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { PRIMARY, SECONDARY } from '@/shared/ui/controls';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';
import { liveOffers, openRequests } from '../tradeHub';

/// The requests still looking for a seller: the list the Trade card counts.
export function YourRequests() {
  const { locale } = useLocale();
  const hub = TRADE_ENTRY_COPY[locale].desk.hub;
  return (
    <AuthGuard gateTag={hub.requests} gateBody={TRADE_ENTRY_COPY[locale].body}>
      <YourRequestsInner />
    </AuthGuard>
  );
}

function YourRequestsInner() {
  const { locale } = useLocale();
  const entry = TRADE_ENTRY_COPY[locale];
  const hub = entry.desk.hub;
  const t = useTranslations().search;
  const { isBusinessWorkspace } = useWorkspaceContext();
  const me = useAuth().address?.toLowerCase() ?? '';
  // Same key as the Trade card, so the count and the list come from one answer.
  const requests = useQuery({ queryKey: ['search', 'myRequests', me], queryFn: () => api.buyer(me).then((r) => r.jobs), enabled: !!me, staleTime: 15_000 });
  const now = Date.now();
  const open = openRequests(requests.data ?? [], now);

  return (
    <TradeList
      title={hub.requests}
      state={requests.isError ? 'error' : requests.isPending ? 'loading' : 'ready'}
      empty={hub.noneOpen}
      retry={entry.desk.tryAgain}
      onRetry={() => void requests.refetch()}
      action={{ href: tradeEntryRoutes(isBusinessWorkspace).buy, label: hub.postRequest }}
      items={open.map((job) => ({
        key: job.jobId,
        href: `/jobs/${job.jobId}`,
        title: requestTitle(job.briefText) ?? t.request.aRequest,
        line: fill(t.request.states[LINE_COPY[requestLineState(job, now)]].headline, { count: job.bids.length }),
        amount: `${walletAmount(job.budgetUsdc) ?? job.budgetUsdc} USDC`,
      }))}
    />
  );
}

/// The offers still on the market: the list the Trade card counts.
export function YourOffers() {
  const { locale } = useLocale();
  const hub = TRADE_ENTRY_COPY[locale].desk.hub;
  return (
    <AuthGuard gateTag={hub.offers} gateBody={TRADE_ENTRY_COPY[locale].body}>
      <YourOffersInner />
    </AuthGuard>
  );
}

function YourOffersInner() {
  const { locale } = useLocale();
  const entry = TRADE_ENTRY_COPY[locale];
  const hub = entry.desk.hub;
  const { isBusinessWorkspace } = useWorkspaceContext();
  const me = useAuth().address?.toLowerCase() ?? '';
  const listings = useQuery({ queryKey: ['trade-hub', 'listings', me], queryFn: () => api.listingsForSeller(me).then((r) => r.listings), enabled: !!me, staleTime: 15_000 });
  const live = liveOffers(listings.data ?? [], Date.now());

  return (
    <TradeList
      title={hub.offers}
      state={listings.isError ? 'error' : listings.isPending ? 'loading' : 'ready'}
      empty={hub.noneLive}
      retry={entry.desk.tryAgain}
      onRetry={() => void listings.refetch()}
      action={{ href: tradeEntryRoutes(isBusinessWorkspace).sell, label: hub.postOffer }}
      items={live.map((l) => ({
        key: l.id,
        href: `/listings/${l.id}`,
        title: l.title,
        line: hub.live,
        amount: `${walletAmount(String(l.askingPriceUsdc)) ?? l.askingPriceUsdc} USDC`,
      }))}
    />
  );
}

/// One list of your own trades. Empty, it says so and offers the one way to
/// start; with items, starting another stays at the foot as a second choice.
function TradeList({ title, state, empty, retry, onRetry, action, items }: {
  title: string;
  state: 'loading' | 'error' | 'ready';
  empty: string;
  retry: string;
  onRetry: () => void;
  action: { href: string; label: string };
  items: Array<{ key: string; href: string; title: string; line: string; amount: string }>;
}) {
  let body: ReactNode;
  if (state === 'loading') {
    body = <div aria-hidden className="h-[76px] rounded-[18px] bg-[var(--lp-light)] motion-safe:animate-pulse" />;
  } else if (state === 'error') {
    body = (
      <button type="button" onClick={onRetry} className={SECONDARY}>
        {retry}
      </button>
    );
  } else if (items.length === 0) {
    body = (
      <div className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-6">
        <p className="text-[15px] font-medium text-[var(--lp-text-sub)]">{empty}</p>
        <Link href={action.href} className={`${PRIMARY} mt-4`}>
          {action.label}
        </Link>
      </div>
    );
  } else {
    body = (
      <>
        <ul className="divide-y divide-[var(--lp-border-light)] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-[15px] font-semibold text-[var(--lp-dark)]">{item.title}</span>
                  <span className="block text-[14px] font-medium text-[var(--lp-text-sub)]">{item.line}</span>
                </span>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{item.amount}</span>
                <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--lp-text-sub)]" />
              </Link>
            </li>
          ))}
        </ul>
        <Link href={action.href} className={`${SECONDARY} mt-4`}>
          {action.label}
        </Link>
      </>
    );
  }
  return <ProfileFrame title={title}>{body}</ProfileFrame>;
}
