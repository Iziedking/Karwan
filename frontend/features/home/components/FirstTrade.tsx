'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/features/deals/workspace/Sheet';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { stageOf } from '@/features/deals/components/DirectDealList';
import type { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
import { TelegramConnectButton } from '@/features/telegram/components/TelegramConnectButton';
import { useTelegramLink } from '@/features/telegram/hooks/useTelegramLink';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { PRIMARY, SECONDARY } from '@/shared/ui/controls';
import { cn } from '@/shared/utils/cn';
import { tradeEntryRoutes } from '../tradeEntry';
import { firstTrade, type FirstTradeStep } from '../firstTrade';

const HIDDEN_PREFIX = 'karwan:first-trade-hidden:';

/// "Your first trade" on Home: how many steps are done and the next one, with
/// the whole list in a drawer (view 39). Each step ticks itself from what is
/// true. Gone once a deal has finished, or when hidden.
export function FirstTrade({ deals, dealsState, className }: {
  deals: ReturnType<typeof useDirectDeals>['deals'];
  dealsState: ReturnType<typeof useDirectDeals>['fetchState'];
  className?: string;
}) {
  const messages = useTranslations();
  const t = messages.firstTrade;
  const card = messages.startFlow.home.firstTrade;
  const [open, setOpen] = useState(false);
  const me = useAuth().address?.toLowerCase() ?? '';
  const owned = useOwnedBalance();
  const telegram = useTelegramLink(me || undefined);
  const { profile, fetchState: profileState } = useUserProfile();
  // The same keys the market's own lists use, so this costs no extra reads.
  const requests = useQuery({ queryKey: ['search', 'myRequests', me], queryFn: () => api.buyer(me).then((r) => r.jobs), enabled: !!me, staleTime: 15_000 });
  const listings = useQuery({ queryKey: ['trade-hub', 'listings', me], queryFn: () => api.listingsForSeller(me).then((r) => r.listings), enabled: !!me, staleTime: 15_000 });
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(!!me && window.localStorage.getItem(`${HIDDEN_PREFIX}${me}`) === '1');
    } catch {
      setHidden(false);
    }
  }, [me]);

  const dealsLoaded = dealsState === 'success' || dealsState === 'error';
  const view = firstTrade({
    reach: profile?.settings?.notifyVia ?? null,
    balance: owned.loading ? null : owned.total ?? 0,
    telegram: !telegram.status ? null : !telegram.status.enabled ? 'unavailable' : telegram.status.linked ? 'linked' : 'unlinked',
    startedTrade: !dealsLoaded || requests.isPending || listings.isPending
      ? null
      : deals.length > 0 || (requests.data?.length ?? 0) > 0 || (listings.data?.length ?? 0) > 0,
    settledTrade: dealsLoaded ? deals.some((deal) => stageOf(deal) === 'settled') : null,
    setupDone: profileState === 'success' ? !!profile?.settings?.setupDoneAt : null,
    goals: profile?.goals ?? [],
    ownClients: profile?.agentPrefs?.findClients === false && (profile?.goals ?? []).some((g) => g === 'work' || g === 'sell'),
    // X is connected through sign-in with X, so it is proven.
    connected: !!profile?.xHandle,
  });

  if (!view.visible || hidden) return null;

  function hide() {
    setOpen(false);
    setHidden(true);
    try {
      window.localStorage.setItem(`${HIDDEN_PREFIX}${me}`, '1');
    } catch {
      // Private browsing: it stays hidden for this visit only.
    }
  }

  const routes = tradeEntryRoutes();
  const action = (key: FirstTradeStep) => {
    if (key === 'setup') return <Link href="/start?step=about" className={PRIMARY}>{t.steps.setup.action}</Link>;
    if (key === 'connect') return <Link href="/profile/setup" className={PRIMARY}>{t.steps.connect.action}</Link>;
    if (key === 'money') {
      // On testnet nobody holds USDC yet, so the faucet comes first.
      if (ARC_NETWORK === 'testnet') {
        return (
          <div className="flex flex-wrap gap-2">
            <Link href="/profile/wallets" className={PRIMARY}>{t.steps.money.faucet}</Link>
            <Link href="/bridge?direction=in" className={SECONDARY}>{t.steps.money.fromWallet}</Link>
          </div>
        );
      }
      return <Link href="/bridge?direction=in" className={PRIMARY}>{t.steps.money.action}</Link>;
    }
    if (key === 'telegram') return <TelegramConnectButton address={me || undefined} tone="light" />;
    if (key === 'deal' && view.dealAction === 'paymentRequest') {
      return (
        <div className="flex flex-wrap gap-2">
          <Link href="/request" className={PRIMARY}>{t.steps.deal.paymentRequest}</Link>
          <Link href={routes.agreement} className={SECONDARY}>{t.steps.deal.agreement}</Link>
        </div>
      );
    }
    if (key === 'deal') {
      return (
        <div className="flex flex-wrap gap-2">
          <Link href={routes.buy} className={PRIMARY}>{t.steps.deal.buy}</Link>
          <Link href={routes.sell} className={SECONDARY}>{t.steps.deal.sell}</Link>
          <Link href={routes.agreement} className={SECONDARY}>{t.steps.deal.agreement}</Link>
        </div>
      );
    }
    return null;
  };
  const note = (key: FirstTradeStep) =>
    key === 'money' ? (ARC_NETWORK === 'testnet' ? t.steps.money.testnetNote : t.steps.money.note) : key === 'telegram' ? t.steps.telegram.note : key === 'connect' ? t.steps.connect.note : null;

  const total = view.steps.length;
  return (
    <section aria-labelledby="first-trade" className={cn('flex flex-col rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="first-trade" className="text-[19px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{t.title}</h2>
        <span className="text-[14px] font-semibold tabular-nums text-[var(--lp-text-sub)]">
          {card.done.replace('{done}', String(view.done)).replace('{total}', String(total))}
        </span>
      </div>
      <div aria-hidden className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {view.steps.map((step) => (
          <span key={step.key} className={cn('h-1.5 rounded-full', step.done ? 'bg-[var(--lp-accent)]' : step.key === view.next ? 'bg-[var(--lp-dark)]' : 'bg-[var(--lp-border-light)]')} />
        ))}
      </div>
      {view.next ? (
        <p className="mt-3 text-[15px] font-medium text-[var(--lp-text-sub)]">
          {card.next.replace('{step}', card.nextLabels[view.next])}
        </p>
      ) : null}
      <div className="mt-auto pt-5">
        <button type="button" onClick={() => setOpen(true)} className={SECONDARY}>{card.see}</button>
      </div>

      <Sheet open={open} title={t.title} onClose={() => setOpen(false)}>
        <p className="-mt-2 text-[15px] font-medium text-[var(--lp-text-sub)]">
          {card.done.replace('{done}', String(view.done)).replace('{total}', String(total))}. {card.body}
        </p>
        <ol className="mt-4 divide-y divide-[var(--lp-border-light)]">
          {view.steps.map((step) => {
            const current = step.key === view.next;
            const words = t.steps[step.key].label;
            return (
              <li key={step.key} aria-current={current ? 'step' : undefined} className="flex gap-3 py-3.5">
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border',
                    step.done ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)] text-[var(--accent-ink)]' : current ? 'border-2 border-[var(--lp-dark)]' : 'border-[var(--lp-outline-strong)]',
                  )}
                >
                  {step.done ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[16px] font-semibold', step.done ? 'text-[var(--lp-text-sub)]' : 'text-[var(--lp-dark)]')}>
                    {words}
                    {step.done ? <span className="sr-only"> ✓</span> : null}
                  </p>
                  {current && note(step.key) ? <p className="mt-0.5 text-[14px] font-medium text-[var(--lp-text-sub)]">{note(step.key)}</p> : null}
                  {current ? <div className="mt-3">{action(step.key)}</div> : null}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-2 border-t border-[var(--lp-border-light)] pt-4">
          <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.flowTitle}</p>
          <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[15px] font-medium text-[var(--lp-dark)] sm:grid-cols-4">
            {t.flow.map((line, i) => (
              <li key={line} className="min-w-0">
                <span aria-hidden className={cn('block h-1 rounded-full', i === 0 ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-border-light)]')} />
                <span className="mt-2 block">{line}</span>
              </li>
            ))}
          </ol>
        </div>

        <button type="button" onClick={hide} className="mt-5 inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          {t.hide}
        </button>
      </Sheet>
    </section>
  );
}
