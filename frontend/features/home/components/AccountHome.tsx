'use client';

import Link from 'next/link';
import { m } from 'motion/react';
import type { UserProfile } from '@/core/api';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { AskCard } from './AskCard';
import { FaucetDrop } from './FaucetDrop';
import { FirstTrade } from './FirstTrade';
import { HomeBlock } from './HomeBlock';
import { HomeDeals } from './HomeDeals';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { buttonClasses } from '@/shared/components/Button';
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
  const start = translations.startFlow.home;
  const { deals, fetchState } = useDirectDeals();
  const greeting = useGreeting();

  // The same total and parts as the profile and the balance page.
  const owned = useOwnedBalance();
  const totalBalance = owned.total;
  const name = displayName?.trim() || profile.displayName?.trim() || translations.profile.hero.fallbackName;
  // A personal account is greeted by its Karwan tag; a business keeps its name.
  const firstName = profile.handle && accountKind !== 'business' ? `@${profile.handle}` : name.split(/\s+/)[0] || name;

  return (
    <div className="product-surface home-workbench mx-auto w-full max-w-[1180px] pb-12 sm:pb-16">
      <PageTour id={HOME_TOUR_ID} steps={HOME_STEPS} />
      <section aria-labelledby="home-heading" className="pb-2">
        <div className="flex items-start justify-between gap-4 pt-3 sm:pt-4">
          <h1 id="home-heading" className="min-w-0 pt-2.5 text-[15px] font-medium text-[var(--ink-secondary)]">
            {/* bdi keeps a tag such as @lawful whole in right-to-left text. */}
            {greeting ?? translations.businessHome.hero.welcomeBack} <bdi>{firstName}</bdi>
          </h1>
          {ARC_NETWORK === 'testnet' ? <FaucetDrop /> : null}
        </div>

        {/* The balance is the top line of the page with the three money moves
            under it; the one green button on Home is a deal's move (view 48). */}
        <m.div
          data-guide="home-money"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
          aria-label={start.totalBalance}
          role="group"
          className="mt-4"
        >
          <p className="text-[13px] text-[var(--ink-secondary)]">{start.totalBalance}</p>
          {owned.failed ? (
            <p role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[var(--ink)]">
              {home.balanceUnavailable}
              <button type="button" onClick={owned.retry} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                {home.balanceRetry}
              </button>
            </p>
          ) : (
            <p className="mt-1 flex items-baseline gap-2">
              <span className={`text-[34px] font-semibold leading-[1.1] tabular-nums tracking-[-0.03em] text-[var(--ink)] sm:text-[40px] ${owned.loading && totalBalance == null ? 'motion-safe:animate-pulse' : ''}`}>
                {totalBalance == null ? '-' : totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {' '}<span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span>
            </p>
          )}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3 lg:max-w-[540px] [&>a]:px-2 [&>a]:text-center [&>a]:leading-tight sm:[&>a]:px-5">
            <Link href="/bridge?direction=in" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{start.addMoney}</Link>
            <Link href="/send" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{home.send}</Link>
            <Link href="/bridge?direction=out" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{home.withdraw}</Link>
          </div>
        </m.div>

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

