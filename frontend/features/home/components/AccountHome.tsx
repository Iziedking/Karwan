'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import type { UserProfile } from '@/core/api';
import { stageOf } from '@/features/deals/components/DirectDealList';
import { homeDealsPreview } from '@/features/deals/dealsList';
import { useDealRows } from '@/features/deals/useDealRows';
import { OpenDealRow } from '@/features/notifications/components/OpenDealRow';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { AskCard } from './AskCard';
import { FaucetDrop } from './FaucetDrop';
import { FirstTrade } from './FirstTrade';
import { HomeBlock } from './HomeBlock';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
import { fill } from '@/features/deals/workspace/presentation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { UpdatesCarousel } from './UpdatesCarousel';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { PageTour } from '@/shared/guide/PageTour';
import { HOME_TOUR_ID, HOME_STEPS } from '@/shared/guide/tours';
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
  const { deals, fetchState } = useDirectDeals();
  const greeting = useGreeting();

  // The same total and parts as the profile and the balance page.
  const owned = useOwnedBalance();
  const totalBalance = owned.total;
  const activeDeals = deals.filter((deal) => {
    const stage = stageOf(deal);
    return stage !== 'settled' && stage !== 'cancelled';
  });
  const name = displayName?.trim() || profile.displayName?.trim() || translations.profile.hero.fallbackName;
  // A personal account is greeted by its Karwan tag; a business keeps its name.
  const firstName = profile.handle && accountKind !== 'business' ? `@${profile.handle}` : name.split(/\s+/)[0] || name;

  return (
    <div className="product-surface home-workbench mx-auto w-full max-w-[1180px] pb-12 sm:pb-16">
      <PageTour id={HOME_TOUR_ID} steps={HOME_STEPS} />
      <section aria-labelledby="home-heading" className="border-b border-[var(--lp-border-light)] pb-7">
        <div className="flex items-start justify-between gap-4 pt-3 sm:pt-4">
          <h1 id="home-heading" className="min-w-0 pt-2.5 text-[15px] font-semibold text-[var(--lp-text-sub)]">
            {/* bdi keeps a tag such as @lawful whole in right-to-left text. */}
            {greeting ?? translations.businessHome.hero.welcomeBack} <bdi>{firstName}</bdi>
          </h1>
          {ARC_NETWORK === 'testnet' ? <FaucetDrop /> : null}
        </div>

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

        <UpdatesCarousel />
      </section>

      <HomeDeals />
    </div>
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

/// The top of the Deals list (view 44): two that need you, else the next
/// active one. A person with no live deal sees nothing here.
function HomeDeals() {
  const messages = useTranslations();
  const t = messages.dealsPage;
  const { groups } = useDealRows();
  const preview = homeDealsPreview(groups);
  if (!preview.title) return null;
  return (
    <section data-guide="home-deals" aria-labelledby="home-deals-heading" className="pt-7">
      <div className="flex min-h-11 items-center justify-between gap-4 px-1">
        <h2 id="home-deals-heading" className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t[preview.title]}</h2>
        <Link href="/deals" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[14px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent-on-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">{t.allDeals}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="m9 18 6-6-6-6" /></svg></Link>
      </div>
      <ul className={`mt-2 divide-y divide-[var(--lp-border-light)] rounded-[20px] border bg-[var(--lp-card)] px-4 sm:px-5 ${preview.title === 'needsYou' ? 'border-[var(--lp-accent)]' : 'border-[var(--lp-border-light)]'}`}>
        {preview.items.map((r) => <OpenDealRow key={r.key} {...r.row} yourMove={r.yourMove} />)}
      </ul>
    </section>
  );
}
