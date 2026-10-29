'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { UserProfile } from '@/core/api';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { AskCard } from './AskCard';
import { FirstTrade } from './FirstTrade';
import { HomeBlock } from './HomeBlock';
import { pickCurrentDeal } from '@/features/home/currentDeal';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
import { fill } from '@/features/deals/workspace/presentation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc, shortAddress } from '@/shared/utils/format';
import { UpdatesCarousel } from './UpdatesCarousel';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { PageTour } from '@/shared/guide/PageTour';
import { HOME_TOUR_ID, HOME_STEPS } from '@/shared/guide/tours';
import { dealHeadline } from '@/features/home/dealHeadline';
import { labelFor } from '@/features/notifications/dealNextStep';
import { useGreeting } from '@/features/home/greeting';

type AccountKind = 'person' | 'business';

export function AccountHome({ profile, displayName, accountKind = 'person' }: {
  profile: UserProfile;
  displayName?: string | null;
  accountKind?: AccountKind;
}) {
  const translations = useTranslations();
  const home = translations.accountHome;
  const payLink = translations.payLink.create;
  const start = translations.startFlow.home;
  const { address } = useAuth();
  const { deals, fetchState } = useDirectDeals();
  const greeting = useGreeting();

  // The same total and parts as the profile and the balance page.
  const owned = useOwnedBalance();
  const totalBalance = owned.total;
  const activeDeals = deals.filter((deal) => {
    const stage = stageOf(deal);
    return stage !== 'settled' && stage !== 'cancelled';
  });
  const currentDeal = pickCurrentDeal(deals);
  const recentDeals = currentDeal ? deals.filter((deal) => deal.jobId !== currentDeal.jobId) : deals;
  const showRecentDeals = recentDeals.length > 0 || !currentDeal || fetchState !== 'success';
  const name = displayName?.trim() || profile.displayName?.trim() || translations.profile.hero.fallbackName;
  // A personal account is greeted by its Karwan tag; a business keeps its name.
  const firstName = profile.handle && accountKind !== 'business' ? `@${profile.handle}` : name.split(/\s+/)[0] || name;

  return (
    <div className="product-surface home-workbench mx-auto w-full max-w-[1180px] pb-12 sm:pb-16">
      <PageTour id={HOME_TOUR_ID} steps={HOME_STEPS} />
      <section aria-labelledby="home-heading" className="border-b border-[var(--lp-border-light)] pb-7">
        <h1 id="home-heading" className="pt-3 text-[15px] font-semibold text-[var(--lp-text-sub)] sm:pt-4">
          {/* bdi keeps a tag such as @lawful whole in right-to-left text. */}
          {greeting ?? translations.businessHome.hero.welcomeBack} <bdi>{firstName}</bdi>
        </h1>

        {/* The balance is the top line of the page, with its four moves beside
            it; the next steps sit under it side by side (view 39). */}
        <motion.div
          data-guide="home-money"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
          aria-label={start.totalBalance}
          role="group"
          className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[var(--lp-text-sub)]">{start.totalBalance}</p>
            {owned.failed ? (
              <p role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[var(--lp-dark)]">
                {home.balanceUnavailable}
                <button type="button" onClick={owned.retry} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  {home.balanceRetry}
                </button>
              </p>
            ) : (
              <p className="mt-1.5 flex items-baseline gap-2.5">
                <span className={`text-[44px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[56px] ${owned.loading && totalBalance == null ? 'motion-safe:animate-pulse' : ''}`}>
                  {totalBalance == null ? '-' : totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {' '}<span className="text-[17px] font-bold text-[var(--lp-text-sub)]">USDC</span>
              </p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[15px] font-medium text-[var(--lp-text-sub)]">
              {activeDeals.length === 1 ? home.activeTradesOne : fill(home.activeTrades, { n: activeDeals.length })}
              <span aria-hidden>·</span>
              <Link href="/account" className="inline-flex min-h-11 items-center gap-1 font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent-on-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                {home.details}
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 lg:flex lg:gap-3">
            <QuickAction href="/bridge?direction=in" icon="add" primary wide={start.addMoney}>{home.add}</QuickAction>
            <QuickAction href="/send" icon="send">{home.send}</QuickAction>
            <QuickAction href="/request" icon="request">{payLink.short}</QuickAction>
            <QuickAction href="/bridge?direction=out" icon="withdraw">{home.withdraw}</QuickAction>
          </div>
        </motion.div>

        <div className="mt-7 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          <HomeBlock profile={profile} />
          <FirstTrade deals={deals} dealsState={fetchState} />
          <AskCard />
        </div>

        {ARC_NETWORK === 'testnet' ? (
          <Link
            href="/profile/wallets"
            className="mt-4 flex min-h-[52px] items-center gap-3 rounded-[16px] border border-[var(--faucet-strip-line)] bg-[var(--faucet-strip)] py-2 pe-2 ps-3 text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--lp-card)]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--lp-accent)" stroke="var(--lp-accent-on-light)" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /></svg>
            </span>
            <span className="min-w-0 flex-1 text-[15px] leading-snug">
              <span className="font-bold">{home.faucetLabel}</span> · {home.faucetBody}
            </span>
            <span className="shrink-0 rounded-full bg-[var(--lp-dark)] px-4 py-2 text-[14px] font-semibold text-[var(--lp-card)]">{home.faucetClaim}</span>
          </Link>
        ) : null}

        <UpdatesCarousel />
      </section>

      <section data-guide="home-deals" className={`${currentDeal && showRecentDeals ? 'home-deals-grid grid gap-5' : ''} pt-7`} aria-label={home.trades}>
        {currentDeal ? <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-w-0 flex-col"
        >
          <div className="flex min-h-11 items-center px-1">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{home.currentTrade}</h2>
          </div>
          <CurrentTrade deal={currentDeal} />
        </motion.div> : null}

        {showRecentDeals ? <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-w-0 flex-col"
        >
          <div className="flex min-h-11 items-center justify-between gap-4 px-1">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{home.recentTrades}</h2>
            <Link href="/activity" className="inline-flex min-h-11 shrink-0 items-center text-[14px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] gap-1">{home.allActivity}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="m9 18 6-6-6-6" /></svg></Link>
          </div>
          <div className="mt-3 flex flex-1 flex-col"><TradeBook deals={recentDeals} fetchState={fetchState} /></div>
        </motion.div> : null}
      </section>
    </div>
  );
}


/// The trade that needs attention first: what it is and with whom, the amount
/// as the loudest line, whose move it is, and where it stands. It stretches to
/// the height of the recent trades beside it, so both columns end together.
function CurrentTrade({ deal }: { deal: NonNullable<ReturnType<typeof pickCurrentDeal>> }) {
  const translations = useTranslations();
  const home = translations.accountHome;
  const { address } = useAuth();
  const isBuyer = address?.toLowerCase() === deal.buyer.toLowerCase();
  const stage = stageOf(deal);
  const counterparty = deal.counterpartyName || (isBuyer ? deal.sellerPaytag || shortAddress(deal.seller) : shortAddress(deal.buyer));
  const next = labelFor(stage, isBuyer, translations.pending.chips);
  const yours = next?.kind === 'action';
  return (
    <div className="trade-route mt-3 flex flex-1 flex-col">
      <div className="flex items-center gap-3">
        <PersonAvatar address={isBuyer ? deal.seller : deal.buyer} name={counterparty} size={40} />
        <div className="min-w-0">
          <p dir="auto" className="truncate text-[16px] font-semibold text-[var(--lp-dark)]">{dealHeadline(deal.terms) || home.tradeDetails}</p>
          <p dir="auto" className="mt-0.5 truncate text-[14px] font-medium text-[var(--lp-text-sub)]">{counterparty}</p>
        </div>
      </div>

      <p className="mt-6 flex items-baseline gap-2">
        <span className="text-[30px] font-bold leading-none tabular-nums tracking-[-0.03em] text-[var(--lp-dark)]">{formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}</span>
        {' '}<span className="text-[16px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
      </p>
      <p className="mt-2 flex items-center gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${yours ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-text-sub)]'}`} />
        <span className="truncate">{translations.dealStage.labels[stage]}{next ? <span className="font-medium text-[var(--lp-text-sub)]"> · {next.text}</span> : null}</span>
      </p>

      <div className="mt-auto pt-6">
        <DealFlow
          stage={stage}
          delivered={deal.delivered === true}
          labels={[home.flowAgreement, home.flowSecured, home.flowDelivery, home.flowSettlement]}
          progressLabel={home.dealProgress}
          states={{ done: home.flowDone, now: home.flowNow, disputed: home.flowDisputed, upcoming: home.flowUpcoming }}
        />
        <Link
          href={`/deals/${deal.jobId}`}
          className={`mt-5 inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full px-5 text-[15px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 ${yours ? 'bg-[var(--lp-accent)] text-[var(--accent-ink)]' : 'border border-[var(--lp-border-light)] bg-[var(--tint)] text-[var(--lp-dark)]'}`}
        >
          {yours && next ? next.text : home.tradeDetails}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="m9 18 6-6-6-6" /></svg>
        </Link>
      </div>
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
    <ol className="grid grid-cols-4 gap-1.5" aria-label={progressLabel}>
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
              className={`mt-2 block truncate text-[14px] ${
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

const QUICK_ICONS = {
  add: <path d="M12 5v14M5 12h14" />,
  send: <path d="M7 17 17 7M9 7h8v8" />,
  request: <path d="M17 7 7 17M15 17H7V9" />,
  withdraw: <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />,
} as const;

/// A round button with its word under it on a phone, as on a banking app, and
/// a pill on a wide screen where there is room for the words beside the icon.
/// Add is the one filled in lime; the others sit quietly beside it.
function QuickAction({ href, icon, primary = false, wide, children }: { href: string; icon: keyof typeof QUICK_ICONS; primary?: boolean; wide?: string; children: string }) {
  return (
    <Link href={href} className={`group flex min-h-11 flex-col items-center gap-1.5 rounded-[16px] py-1 text-[13px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] lg:h-12 lg:flex-row lg:gap-2 lg:rounded-full lg:px-5 lg:py-0 lg:text-[15px] lg:font-bold ${primary ? 'lg:bg-[var(--lp-accent)] lg:text-[var(--accent-ink)]' : 'lg:border lg:border-[var(--lp-border-light)] lg:bg-[var(--tint)]'}`}>
      <span aria-hidden className={`grid size-12 place-items-center rounded-full transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0 lg:size-auto lg:bg-transparent lg:group-hover:translate-y-0 ${primary ? 'bg-[var(--lp-accent)] text-[var(--accent-ink)]' : 'border border-[var(--lp-border-light)] bg-[var(--tint)] text-[var(--lp-dark)] lg:border-0'}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lg:size-[18px]">{QUICK_ICONS[icon]}</svg>
      </span>
      <span className="max-w-full truncate lg:hidden">{children}</span>
      <span className="hidden whitespace-nowrap lg:inline">{wide ?? children}</span>
    </Link>
  );
}

function TradeBook({ deals, fetchState }: { deals: ReturnType<typeof useDirectDeals>['deals']; fetchState: ReturnType<typeof useDirectDeals>['fetchState'] }) {
  const t = useTranslations();
  const { address } = useAuth();
  const me = address?.toLowerCase();
  if (fetchState === 'loading' || fetchState === 'idle') return <div className="space-y-px overflow-hidden rounded-[16px] bg-[var(--lp-border-light)]" aria-label={t.accountHome.loadingRecent}><div className="h-20 animate-pulse bg-[var(--lp-card)] motion-reduce:animate-none" /><div className="h-20 animate-pulse bg-[var(--lp-card)] motion-reduce:animate-none" /></div>;
  if (fetchState === 'error') return <p className="rounded-[16px] bg-[var(--lp-card)] p-5 text-[14px] text-[var(--lp-text-sub)] font-medium">{t.dealsFeed.errorBody}</p>;
  if (deals.length === 0) return <p className="border-s-2 border-[var(--lp-accent)] py-4 ps-4 text-[14px] leading-6 text-[var(--lp-text-sub)] font-medium"><span className="block font-semibold text-[var(--lp-dark)]">{t.accountHome.noTrades}</span><span className="mt-1 block">{t.accountHome.noTradesHint}</span></p>;
  return (
    <ul className="trade-book flex-1 overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
      {deals.slice(0, 5).map((deal) => {
        const isBuyer = me === deal.buyer.toLowerCase();
        const stage = stageOf(deal);
        const counterparty = deal.counterpartyName || (isBuyer ? deal.sellerPaytag || shortAddress(deal.seller) : shortAddress(deal.buyer));
        const date = new Date(deal.updatedAt || deal.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        const title = dealHeadline(deal.terms) || counterparty;
        return (
          <li key={deal.jobId}>
            <Link href={`/deals/${deal.jobId}`} className="group grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5">
              <PersonAvatar address={isBuyer ? deal.seller : deal.buyer} name={counterparty} size={36} />
              <span className="min-w-0"><span dir="auto" className="block truncate text-[15px] font-semibold text-[var(--lp-dark)]">{title}</span><span className="mt-1 block truncate text-[14px] text-[var(--lp-text-sub)] font-medium">{title === counterparty ? '' : `${counterparty} · `}{t.dealStage.labels[stage]} · {date}</span></span>
              <span className="flex items-center gap-2"><span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{formatUsdc(deal.dealAmountUsdc, { withSuffix: true })}</span><span className="text-[var(--lp-text-sub)] transition-transform duration-200 group-hover:translate-x-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="m9 18 6-6-6-6" /></svg></span></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
