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
import { SECONDARY } from '@/shared/ui/controls';
import { buttonClasses } from '@/shared/components/Button';

/// A step's move. Secondary: Home's one green button is a deal's move (view 48).
const STEP_MOVE = buttonClasses({ variant: 'secondary', size: 'lg' });
import { cn } from '@/shared/utils/cn';
import { tradeEntryRoutes } from '../tradeEntry';
import { firstTrade, type FirstTradeStep } from '../firstTrade';
import { CARD_PILL, CardGlyph, LitCard, type CardIcon } from './LitCard';

const PILL_ICON = 'shrink-0 text-[var(--lp-text-sub)]';

const HIDDEN_PREFIX = 'karwan:first-trade-hidden:';

/// "Your first trade" on Home: a ring with how many steps are done, the next
/// step one tap away, and the whole list in a drawer (view 39). Each step ticks itself from what is
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
    if (key === 'setup') return <Link href="/start?step=about" className={STEP_MOVE}>{t.steps.setup.action}</Link>;
    if (key === 'connect') return <Link href="/profile/sources" className={STEP_MOVE}>{t.steps.connect.action}</Link>;
    if (key === 'money') {
      // On testnet nobody holds USDC yet, so the faucet comes first.
      if (ARC_NETWORK === 'testnet') {
        return (
          <div className="flex flex-wrap gap-2">
            <Link href="/profile/wallets" className={STEP_MOVE}>{t.steps.money.faucet}</Link>
            <Link href="/add" className={SECONDARY}>{t.steps.money.fromWallet}</Link>
          </div>
        );
      }
      return <Link href="/add" className={STEP_MOVE}>{t.steps.money.action}</Link>;
    }
    if (key === 'telegram') return <TelegramConnectButton address={me || undefined} tone="light" />;
    if (key === 'deal' && view.dealAction === 'paymentRequest') {
      return (
        <div className="flex flex-wrap gap-2">
          <Link href="/request" className={STEP_MOVE}>{t.steps.deal.paymentRequest}</Link>
          <Link href={routes.agreement} className={SECONDARY}>{t.steps.deal.agreement}</Link>
        </div>
      );
    }
    if (key === 'deal') {
      return (
        <div className="flex flex-wrap gap-2">
          <Link href={routes.buy} className={STEP_MOVE}>{t.steps.deal.buy}</Link>
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
  const doneText = card.done.replace('{done}', String(view.done)).replace('{total}', String(total));
  // The next step one tap away (owner, 6 Nov 2026: version B). Steps with a
  // choice in them (Telegram's connect, buy or sell) open the list instead.
  const nextMove = ((): { label: string; icon: CardIcon; href?: string } | null => {
    switch (view.next) {
      case 'setup': return { label: t.steps.setup.action, icon: 'user', href: '/start?step=about' };
      case 'connect': return { label: t.steps.connect.label, icon: 'link', href: '/profile/sources' };
      case 'money': return ARC_NETWORK === 'testnet'
        ? { label: t.steps.money.faucet, icon: 'plus', href: '/profile/wallets' }
        : { label: t.steps.money.action, icon: 'plus', href: '/add' };
      case 'telegram': return { label: t.steps.telegram.label, icon: 'send' };
      case 'deal': return view.dealAction === 'paymentRequest'
        ? { label: t.steps.deal.paymentRequest, icon: 'request', href: '/request' }
        : { label: t.steps.deal.label, icon: 'request' };
      default: return null;
    }
  })();
  const ring = (
    <span role="img" aria-label={doneText} className="relative grid size-10 shrink-0 place-items-center">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r="17" fill="none" strokeWidth="4" className="stroke-[var(--lp-border-light)]" />
        <circle cx="20" cy="20" r="17" fill="none" strokeWidth="4" strokeLinecap="round" pathLength={total} strokeDasharray={`${view.done} ${total}`} className="stroke-[var(--lp-accent)]" />
      </svg>
      <span aria-hidden className="text-[13px] font-semibold tabular-nums text-[var(--lp-dark)]">{view.done}/{total}</span>
    </span>
  );
  return (
    <LitCard badge={ring} title={t.title} body={card.body} titleId="first-trade" className={className}>
      <div data-first-trade className="mt-auto flex flex-wrap gap-2 pt-5">
        {nextMove?.href ? (
          <Link href={nextMove.href} className={CARD_PILL}><CardGlyph name={nextMove.icon} size={16} className={PILL_ICON} />{nextMove.label}</Link>
        ) : nextMove ? (
          <button type="button" onClick={() => setOpen(true)} className={CARD_PILL}><CardGlyph name={nextMove.icon} size={16} className={PILL_ICON} />{nextMove.label}</button>
        ) : null}
        <button type="button" onClick={() => setOpen(true)} className={CARD_PILL}><CardGlyph name="list" size={16} className={PILL_ICON} />{card.see}</button>
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
                    step.done ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]' : current ? 'border-2 border-[var(--lp-dark)]' : 'border-[var(--lp-outline-strong)]',
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
                <span aria-hidden className={cn('block h-1 rounded-full', i === 0 ? 'bg-[var(--ink)]' : 'bg-[var(--lp-border-light)]')} />
                <span className="mt-2 block">{line}</span>
              </li>
            ))}
          </ol>
        </div>

        <button type="button" onClick={hide} className="mt-5 inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          {t.hide}
        </button>
      </Sheet>
    </LitCard>
  );
}
