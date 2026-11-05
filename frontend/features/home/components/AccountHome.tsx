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
import { RecordHomeNudge } from './RecordHomeNudge';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
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

        {/* The balance is the top line of the page with the four money moves
            under it as round buttons; the one green button on Home is a deal's
            move (view 48). */}
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
          <div className="mt-6 grid max-w-[420px] grid-cols-4 gap-2">
            <QuickAction href="/add" icon="add" green>{start.addMoney}</QuickAction>
            <QuickAction href="/send" icon="send">{home.send}</QuickAction>
            <QuickAction href="/request" icon="request">{translations.payLink.create.short}</QuickAction>
            <QuickAction href="/withdraw" icon="withdraw">{home.withdraw}</QuickAction>
          </div>
        </m.div>

        <RecordHomeNudge />

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

/// A round button with its word under it, as on a banking app (owner notes,
/// 3 Nov 2026). Add money is the green one (owner notes, 4 Nov 2026).
function QuickAction({ href, icon, green = false, children }: { href: string; icon: keyof typeof QUICK_ICONS; green?: boolean; children: string }) {
  return (
    <Link
      href={href}
      data-money-move
      className="group flex min-h-11 flex-col items-center gap-2 rounded-[16px] py-1 text-center text-[13px] font-medium leading-tight text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
    >
      <span aria-hidden className={`grid size-14 place-items-center rounded-full border transition-transform ${green ? 'border-[var(--action)] bg-[var(--action)] text-[var(--on-action)]' : 'border-[var(--line-strong)] bg-[var(--raised)]'} duration-[var(--dur-press)] group-active:scale-95 motion-reduce:transition-none`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{QUICK_ICONS[icon]}</svg>
      </span>
      <span className="max-w-full">{children}</span>
    </Link>
  );
}
