'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { api, type UserProfile } from '@/core/api';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc, shortAddress } from '@/shared/utils/format';
import { UpdatesCarousel } from './UpdatesCarousel';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { PageTour } from '@/shared/guide/PageTour';
import { HOME_TOUR_ID, HOME_STEPS } from '@/shared/guide/tours';
import { dealHeadline } from '@/features/home/dealHeadline';

type AccountKind = 'person' | 'business';

export function AccountHome({ profile, displayName, accountKind = 'person' }: {
  profile: UserProfile;
  displayName?: string | null;
  accountKind?: AccountKind;
}) {
  const translations = useTranslations();
  const home = translations.accountHome;
  const payLink = translations.payLink.create;
  const { address } = useAuth();
  const { deals, fetchState } = useDirectDeals();
  const overview = useQuery({
    queryKey: address ? ['wallet-overview', address] : ['wallet-overview', 'anon'],
    queryFn: () => api.walletOverview(address!),
    enabled: !!address,
    staleTime: 20_000,
    refetchInterval: 20_000,
  });

  const totalBalance = overview.data
    ? [overview.data.identity?.usdcBalance, overview.data.agents?.buyer?.usdcBalance, overview.data.agents?.seller?.usdcBalance]
        .reduce((sum, value) => sum + (Number(value) || 0), 0)
    : null;
  const activeDeals = deals.filter((deal) => {
    const stage = stageOf(deal);
    return stage !== 'settled' && stage !== 'cancelled';
  });
  const currentDeal = activeDeals[0] ?? null;
  const recentDeals = currentDeal ? deals.filter((deal) => deal.jobId !== currentDeal.jobId) : deals;
  const showRecentDeals = recentDeals.length > 0 || !currentDeal || fetchState !== 'success';
  const name = displayName?.trim() || profile.displayName?.trim() || translations.profile.hero.fallbackName;
  // A personal account is greeted by its Karwan tag; a business keeps its name.
  const firstName = profile.handle && accountKind !== 'business' ? `@${profile.handle}` : name.split(/\s+/)[0] || name;

  return (
    <div className="product-surface home-workbench mx-auto w-full max-w-[1180px] pb-12 sm:pb-16">
      <PageTour id={HOME_TOUR_ID} steps={HOME_STEPS} />
      <section aria-labelledby="home-heading" className="border-b border-[var(--lp-border-light)] pb-7">
        <h1 id="home-heading" className="pt-3 text-[14px] font-semibold text-[var(--lp-text-sub)] sm:pt-4">
          {translations.businessHome.hero.welcomeBack} {firstName}
        </h1>

        <div className="mt-4 flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:gap-6">
          <motion.div
            data-guide="home-money"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
            className="w-full rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4 sm:rounded-[24px] sm:p-6 lg:max-w-[520px]"
            aria-label={home.balanceLabel}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-[var(--lp-text-sub)] sm:text-[14px]">{home.balanceLabel}</p>
              <Link href="/account" className="-me-1 inline-flex min-h-9 items-center gap-1 rounded-full px-1 text-[13px] font-semibold text-[var(--lp-dark)] hover:text-[var(--lp-accent-on-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                {home.details}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="m9 18 6-6-6-6" /></svg>
              </Link>
            </div>
            <p className="mt-1.5 flex items-baseline gap-2">
              <span className={`text-[34px] font-semibold leading-none tabular-nums tracking-[-0.04em] text-[var(--lp-dark)] sm:text-[44px] ${overview.isFetching && totalBalance == null ? 'motion-safe:animate-pulse' : ''}`}>
                {totalBalance == null ? '-' : totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[14px] text-[var(--lp-text-sub)]">USDC</span>
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--lp-text-sub)] sm:text-[13px]">
              {home.activeTrades} {activeDeals.length} · {home.wallets} {overview.data?.agents ? 3 : 1}
            </p>
            <div className="mt-3.5 grid grid-cols-4 gap-2">
              <QuickAction href="/bridge?direction=in">{home.add}</QuickAction>
              <QuickAction href="/bridge?direction=out&intent=move">{home.move}</QuickAction>
              <QuickAction href="/send">{home.send}</QuickAction>
              <QuickAction href="/request">{payLink.short}</QuickAction>
            </div>
            {ARC_NETWORK === 'testnet' ? (
              <Link
                href="/profile/wallets"
                className="mt-3 flex min-h-12 items-center gap-2.5 rounded-[16px] border border-[var(--faucet-strip-line)] bg-[var(--faucet-strip)] py-2 pe-2 ps-2.5 text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              >
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--lp-card)]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--lp-accent)" stroke="var(--lp-accent-on-light)" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /></svg>
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug sm:text-[13px]">
                  <span className="font-bold">{home.faucetLabel}</span> · {home.faucetBody}
                </span>
                <span className="shrink-0 rounded-full bg-[var(--lp-dark)] px-3 py-1.5 text-[12px] font-semibold text-[var(--lp-card)]">{home.faucetClaim}</span>
              </Link>
            ) : null}
          </motion.div>

          <Link
            data-guide="home-start"
            href={accountKind === 'business' ? '/b2b' : '/p2p'}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)]/40 px-5 text-[14px] font-semibold text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-outline-strong)] hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {home.tradeNow}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </Link>
        </div>

        <UpdatesCarousel />
      </section>

      <section data-guide="home-deals" className={`${currentDeal && showRecentDeals ? 'home-deals-grid grid gap-5' : ''} mt-7 border-t border-[var(--lp-border-light)] pt-7`} aria-label={home.trades}>
        {currentDeal ? <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="trade-route"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{home.currentTrade}</p>
              <h2 dir="auto" className="mt-1 line-clamp-1 text-[17px] font-semibold tracking-[-0.01em] text-[var(--lp-dark)]">
                {dealHeadline(currentDeal.terms) || home.tradeDetails}
              </h2>
            </div>
            <Link href={`/deals/${currentDeal.jobId}`} className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent-on-light)]">{translations.profile.hub.open} →</Link>
          </div>

          <p className="mt-5 truncate text-[14px] font-semibold text-[var(--lp-dark)]">
            {formatUsdc(currentDeal.dealAmountUsdc, { withSuffix: true })} · {translations.dealStage.labels[stageOf(currentDeal)]}
          </p>
          <DealFlow
            stage={stageOf(currentDeal)}
            delivered={currentDeal.delivered === true}
            labels={[home.flowAgreement, home.flowSecured, home.flowDelivery, home.flowSettlement]}
            progressLabel={home.dealProgress}
            states={{ done: home.flowDone, now: home.flowNow, disputed: home.flowDisputed, upcoming: home.flowUpcoming }}
          />
        </motion.div> : null}

        {showRecentDeals ? <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="min-w-0"
        >
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <h2 className="text-[23px] font-semibold tracking-[-0.035em] text-[var(--lp-dark)]">{home.recentTrades}</h2>
            </div>
            <Link href="/activity" className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">{home.allActivity} →</Link>
          </div>
          <div className="mt-3"><TradeBook deals={recentDeals} fetchState={fetchState} /></div>
        </motion.div> : null}
      </section>
    </div>
  );
}


/// Which step the deal is on: 0 agreed, 1 funded, 2 delivered, 3 paid, 4 all
/// done. A dispute stays on the step it interrupted, shown as paused.
function progressFor(stage: DealStage | undefined, delivered: boolean): number {
  if (!stage) return -1;
  if (stage === 'awaiting-acceptance') return 0;
  if (stage === 'awaiting-funding') return 1;
  if (stage === 'awaiting-delivery') return 2;
  if (stage === 'awaiting-first-release' || stage === 'awaiting-final-release') return 3;
  if (stage === 'disputed') return delivered ? 3 : 2;
  if (stage === 'settled') return 4;
  return 0;
}

/// Four flat segments with a word under each: filled when done, ink for the
/// current step, the warning colour when a dispute has paused it. The state of
/// every step is also spoken, so colour never carries it alone.
function DealFlow({ stage, delivered, labels, progressLabel, states }: {
  stage?: DealStage;
  delivered: boolean;
  labels: readonly string[];
  progressLabel: string;
  states: { done: string; now: string; disputed: string; upcoming: string };
}) {
  const progress = progressFor(stage, delivered);
  const disputed = stage === 'disputed';
  return (
    <ol className="mt-6 grid grid-cols-4 gap-1.5" aria-label={progressLabel}>
      {labels.map((label, index) => {
        const done = progress > index;
        const current = progress === index;
        const fill = done
          ? 'bg-[var(--chart-bar)]'
          : current
            ? disputed
              ? 'bg-[var(--color-warning)]'
              : 'bg-[var(--lp-dark)]'
            : 'bg-[var(--lp-border-light)]';
        const state = done ? states.done : current ? (disputed ? states.disputed : states.now) : states.upcoming;
        return (
          <li key={label} aria-current={current ? 'step' : undefined} className="min-w-0">
            <span aria-hidden className={`block h-1.5 rounded-full transition-colors duration-200 ${fill}`} />
            <span
              className={`mt-2 block truncate text-[12px] ${
                current ? 'font-semibold text-[var(--lp-dark)]' : done ? 'text-[var(--lp-dark)]' : 'text-[var(--lp-text-sub)]'
              }`}
            >
              {label}
              <span className="sr-only">, {state}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const QUICK_ACTION = 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--lp-border-light)] px-2 text-[13px] font-semibold text-[var(--lp-dark)] transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--lp-outline-strong)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] motion-reduce:hover:translate-y-0';

function QuickAction({ href, children }: { href: string; children: string }) {
  return <Link href={href} className={QUICK_ACTION}>{children}</Link>;
}

function TradeBook({ deals, fetchState }: { deals: ReturnType<typeof useDirectDeals>['deals']; fetchState: ReturnType<typeof useDirectDeals>['fetchState'] }) {
  const t = useTranslations();
  const { address } = useAuth();
  const me = address?.toLowerCase();
  if (fetchState === 'loading' || fetchState === 'idle') return <div className="space-y-px overflow-hidden rounded-[16px] bg-[var(--lp-border-light)]" aria-label={t.accountHome.loadingRecent}><div className="h-20 animate-pulse bg-[var(--lp-card)] motion-reduce:animate-none" /><div className="h-20 animate-pulse bg-[var(--lp-card)] motion-reduce:animate-none" /></div>;
  if (fetchState === 'error') return <p className="rounded-[16px] bg-[var(--lp-card)] p-5 text-[14px] text-[var(--lp-text-sub)]">{t.dealsFeed.errorBody}</p>;
  if (deals.length === 0) return <p className="border-s-2 border-[var(--lp-accent)] py-4 ps-4 text-[14px] leading-6 text-[var(--lp-text-sub)]"><span className="block font-semibold text-[var(--lp-dark)]">{t.accountHome.noTrades}</span><span className="mt-1 block">{t.accountHome.noTradesHint}</span></p>;
  return (
    <ul className="trade-book overflow-hidden rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
      {deals.slice(0, 5).map((deal, index) => {
        const isBuyer = me === deal.buyer.toLowerCase();
        const stage = stageOf(deal);
        const counterparty = isBuyer ? deal.sellerPaytag || shortAddress(deal.seller) : shortAddress(deal.buyer);
        const date = new Date(deal.updatedAt || deal.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        const reference = deal.receiptReferences?.find((value) => value.trim())?.trim();
        return (
          <li key={deal.jobId}>
            <Link href={`/deals/${deal.jobId}`} className="group grid min-h-[80px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5">
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-[var(--lp-light)] text-[12px] font-bold tabular-nums text-[var(--lp-text-sub)]">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0"><span className="block truncate text-[15px] font-semibold text-[var(--lp-dark)]">{counterparty}</span><span className="mt-1 block truncate text-[12px] text-[var(--lp-text-sub)]">{t.dealStage.labels[stage]} · {date}{reference ? ` · ${reference}` : ''}</span></span>
              <span className="text-end"><span className="block whitespace-nowrap text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{formatUsdc(deal.dealAmountUsdc, { withSuffix: true })}</span><span className="mt-1 block text-[12px] text-[var(--lp-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5">{t.profile.hub.open} →</span></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
