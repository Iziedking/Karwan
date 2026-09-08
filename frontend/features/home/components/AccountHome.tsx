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

type AccountKind = 'person' | 'business';

const FLOW_STEPS = ['Agreement', 'USDC secured', 'Delivery', 'Settlement'] as const;

export function AccountHome({ profile, displayName, accountKind = 'person' }: {
  profile: UserProfile;
  displayName?: string | null;
  accountKind?: AccountKind;
}) {
  const translations = useTranslations();
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
  const currentDeal = activeDeals[0] ?? deals[0] ?? null;
  const name = displayName?.trim() || profile.displayName?.trim() || 'your account';
  const firstName = name.split(/\s+/)[0] || name;
  const role = accountKind === 'business'
    ? 'Business account'
    : profile.role === 'both'
      ? 'Buyer and seller'
      : profile.role === 'seller'
        ? 'Seller account'
        : 'Buyer account';
  const heroTitle = getHeroTitle(accountKind, profile.role);
  const featuredTradeLabel = activeDeals.length > 0 ? 'Current trade' : 'Latest trade';

  return (
    <div className="product-surface home-workbench mx-auto w-full max-w-[1180px] pb-12 sm:pb-16">
      <section className="home-command-grid" aria-labelledby="home-heading">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-h-[360px] flex-col justify-between py-3 sm:min-h-[420px] sm:py-6"
        >
          <div>
            <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">Welcome back, {firstName}</p>
            <h1 id="home-heading" className="mt-4 max-w-[13ch] text-[clamp(2.8rem,6.4vw,5.4rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[var(--lp-dark)]">
              {heroTitle}
            </h1>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-6 text-[var(--lp-text-sub)] sm:text-[16px] sm:leading-7">
              Agree on the work, protect payment in USDC, and record delivery.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/market" className="home-primary-action group inline-flex min-h-12 items-center gap-3 rounded-full bg-[var(--lp-accent)] px-5 text-[15px] font-bold text-[var(--accent-ink)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] motion-reduce:hover:translate-y-0">
              Explore the open market <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
            <Link href="/p2p" className="group inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px] font-bold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
              Bring a deal <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">↗</span>
            </Link>
          </div>
        </motion.header>

        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.54, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="home-position"
          aria-label="USDC balance"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">USDC balance</p>
              <p className="mt-0.5 text-[12px] text-[var(--lp-text-muted)]">{role}</p>
            </div>
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--lp-text-sub)]">
              <span aria-hidden data-live="true" className={`size-2 rounded-full bg-[var(--lp-accent)] ${overview.isFetching ? 'motion-safe:animate-pulse' : ''}`} />
              {overview.isFetching ? 'Updating' : 'Current'}
            </span>
          </div>

          <div className="mt-10">
            <p className="text-[clamp(2.8rem,6vw,4.8rem)] font-semibold leading-none tabular-nums tracking-[-0.065em] text-[var(--lp-dark)]">
              {totalBalance == null ? '—' : totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-[14px] font-medium text-[var(--lp-text-sub)]">USDC available</p>
          </div>

          <div className="mt-9 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] bg-[var(--lp-border-light)]">
            <PositionMetric label="Active trades" value={activeDeals.length} />
            <PositionMetric label="Wallets" value={overview.data?.agents ? 3 : 1} />
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 pt-8">
            <div className="flex gap-1.5">
              <QuickAction href="/bridge?direction=in">Add</QuickAction>
              <QuickAction href="/bridge?direction=out&intent=move">Move</QuickAction>
              <QuickAction href="/bridge?direction=out&intent=send">Send</QuickAction>
            </div>
            <Link href="/account" className="inline-flex min-h-11 items-center text-[13px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">Details →</Link>
          </div>
        </motion.aside>
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]" aria-label="Trades">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="trade-route"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{currentDeal ? featuredTradeLabel : 'Trades'}</p>
              <h2 className="mt-1 line-clamp-2 text-[23px] font-semibold tracking-[-0.035em] text-[var(--lp-dark)]">
                {currentDeal ? currentDeal.terms || 'Trade details' : 'No trades yet'}
              </h2>
            </div>
            {currentDeal ? <Link href={`/deals/${currentDeal.jobId}`} className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent)]">Open →</Link> : null}
          </div>

          {currentDeal ? (
            <>
              <p className="mt-5 truncate text-[14px] font-semibold text-[var(--lp-dark)]">
                {formatUsdc(currentDeal.dealAmountUsdc, { withSuffix: true })} · {translations.dealStage.labels[stageOf(currentDeal)]}
              </p>
              <DealFlow stage={stageOf(currentDeal)} />
            </>
          ) : (
            <>
              <DealFlow />
              <p className="mt-5 max-w-[48ch] text-[13px] leading-6 text-[var(--lp-text-sub)]">Start in Discover or bring an existing agreement.</p>
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="min-w-0"
        >
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <h2 className="text-[23px] font-semibold tracking-[-0.035em] text-[var(--lp-dark)]">Recent trades</h2>
            </div>
            <Link href="/activity" className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">All activity →</Link>
          </div>
          <div className="mt-3"><TradeBook deals={deals} fetchState={fetchState} /></div>
        </motion.div>
      </section>
    </div>
  );
}

function getHeroTitle(accountKind: AccountKind, role: UserProfile['role']): string {
  if (accountKind === 'business') return 'Find clients and suppliers. Pay in USDC.';
  if (role === 'seller') return 'Find work. Get paid in USDC.';
  if (role === 'buyer') return 'Find people. Pay in USDC.';
  return 'Find work. Hire people. Pay in USDC.';
}

function progressFor(stage?: DealStage): number {
  if (!stage) return -1;
  if (stage === 'awaiting-acceptance') return 0;
  if (stage === 'awaiting-funding') return 1;
  if (stage === 'awaiting-delivery') return 2;
  if (stage === 'awaiting-first-release' || stage === 'awaiting-final-release' || stage === 'disputed') return 3;
  if (stage === 'settled') return 4;
  return 0;
}

function DealFlow({ stage }: { stage?: DealStage }) {
  const progress = progressFor(stage);
  const flowScale = progress > 0 ? Math.min(progress, FLOW_STEPS.length - 1) / (FLOW_STEPS.length - 1) : 0;
  return (
    <ol
      key={stage ?? 'not-started'}
      className="deal-flow mt-7"
      aria-label="Deal progress"
      style={{ '--flow-scale': flowScale } as CSSProperties}
    >
      {FLOW_STEPS.map((label, index) => {
        const complete = progress > index;
        const active = progress === index;
        return (
          <li
            key={label}
            className={complete ? 'is-complete' : active ? 'is-active' : ''}
            style={{ '--flow-delay': `${120 + index * 105}ms` } as CSSProperties}
          >
            <span aria-hidden className="deal-flow-node">
              <span className="deal-flow-node-mark">{complete ? '✓' : index + 1}</span>
            </span>
            <span className="deal-flow-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function QuickAction({ href, children }: { href: string; children: string }) {
  return <Link href={href} className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-3 text-[13px] font-bold text-[var(--lp-dark)] transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--lp-outline-strong)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] motion-reduce:hover:translate-y-0">{children}</Link>;
}

function PositionMetric({ label, value }: { label: string; value: number }) {
  return <div className="bg-[var(--lp-card)] px-4 py-3"><p className="text-[12px] text-[var(--lp-text-muted)]">{label}</p><p className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--lp-dark)]">{value}</p></div>;
}

function TradeBook({ deals, fetchState }: { deals: ReturnType<typeof useDirectDeals>['deals']; fetchState: ReturnType<typeof useDirectDeals>['fetchState'] }) {
  const t = useTranslations();
  const { address } = useAuth();
  const me = address?.toLowerCase();
  if (fetchState === 'loading' || fetchState === 'idle') return <div className="space-y-px overflow-hidden rounded-[16px] bg-[var(--lp-border-light)]" aria-label="Loading recent trades"><div className="h-20 animate-pulse bg-[var(--lp-card)] motion-reduce:animate-none" /><div className="h-20 animate-pulse bg-[var(--lp-card)] motion-reduce:animate-none" /></div>;
  if (fetchState === 'error') return <p className="rounded-[16px] bg-[var(--lp-card)] p-5 text-[14px] text-[var(--lp-text-sub)]">{t.dealsFeed.errorBody}</p>;
  if (deals.length === 0) return <p className="border-s-2 border-[var(--lp-accent)] py-4 ps-4 text-[14px] leading-6 text-[var(--lp-text-sub)]">No trades yet. Start with an opportunity or bring an existing agreement.</p>;
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
              <span className="text-end"><span className="block whitespace-nowrap text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{formatUsdc(deal.dealAmountUsdc, { withSuffix: true })}</span><span className="mt-1 block text-[12px] text-[var(--lp-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5">Open →</span></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
