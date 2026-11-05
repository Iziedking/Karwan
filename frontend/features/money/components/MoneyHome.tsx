'use client';
import { Suspense, useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { m } from 'motion/react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { NetworkHint } from '@/shared/components/NetworkContext';
import { useActivation } from '@/shared/hooks/useActivation';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { dur } from '@/shared/motion/tokens';
import { fill } from '@/features/deals/workspace/presentation';
import { bridgeChainMeta, useBridges } from '@/features/bridge/hooks/useBridge';
import { formatAmount, formatBalance, heroAmount, homeState, movingTransfer, whereItIs } from '../balanceModel';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import type { AgentKey } from '../moneySheetModel';
import { RecentMoney } from './RecentMoney';
import { SavedAddresses } from '@/features/moneyOut/SavedAddresses';
import { RecoveryRow } from '@/features/recovery/components/RecoveryRow';
import { useHeldDeals, useHeldInDeals } from '../useHeldInDeals';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { whatItIs } from '@/features/deals/workspace/titleLine';
import { dealReference } from '@/features/deals/dealReference';
import { Segmented } from '@/shared/components/Segmented';
import { AgentsTab } from './AgentsTab';
import { WhereItIsSheet } from './WhereItIsSheet';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatDisplay } from '../displayCurrency';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { Hint } from '@/shared/components/Hint';
import { GuaranteeTab } from '@/features/guarantee/GuaranteeTab';
import { ADD_HREF, WITHDRAW_HREF, agentMoveHref, moneyTab, type MoneyTab } from '../moneyRoutes';


const SECONDARY = buttonClasses({ variant: 'secondary' });
const QUIET =
  'inline-flex min-h-11 items-center rounded-[10px] px-3 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const SOFT = 'bg-[var(--raised)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';

export function MoneyHome() {
  const gate = useTranslations().profile.signInGate;
  return (
    <AuthGuard gateTag={gate.tag} gateBody={gate.body}>
      <Suspense fallback={null}>
        <MoneyHomeInner />
      </Suspense>
    </AuthGuard>
  );
}

/// One scrolling page: one balance on Arc, the agents, the last five movements,
/// then the proof, closed until asked for. Other networks are only a way to
/// add money, so they are never listed here.
function MoneyHomeInner() {
  const t = useTranslations().money;
  const mp = useTranslations().moneyPage;
  const mm = useTranslations().moneyMove;
  const pages = useTranslations().moneyPages;
  const held = useHeldInDeals();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The tab lives in the address, so Back and a shared link return to it.
  const tab: MoneyTab = moneyTab(params.get('tab'));
  const { locale } = useLocale();
  const display = useDisplayCurrency();
  const reduce = useHydratedReducedMotion();
  const balances = useMoneyBalances();
  const activation = useActivation();
  const { bridges } = useBridges();
  const [setupOpen, setSetupOpen] = useState(false);
  const [whereOpen, setWhereOpen] = useState(params.get('where') === '1');
  const isWallet = useAuth().method === 'web3';

  const chooseTab = useCallback((next: MoneyTab) => {
    const q = new URLSearchParams(params.toString());
    if (next === 'balance') q.delete('tab'); else q.set('tab', next);
    q.delete('where');
    const rest = q.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // One balance (view 51, third round): what sits with the agent counts too.
  const agents = (balances.buyer ?? 0) + (balances.seller ?? 0);
  const facts = { balance: balances.balance, pool: balances.pool, agents, loading: balances.loading, error: balances.error };
  const parts = whereItIs(facts);
  if (balances.activated && !parts.some((p) => p.part === 'agent')) parts.push({ part: 'agent', amount: 0 });
  // Where it is closes, then the move opens as its own page.
  const fromWhere = (href: string) => {
    setWhereOpen(false);
    router.push(href);
  };
  const richerAgent: AgentKey = (balances.seller ?? 0) > (balances.buyer ?? 0) ? 'seller' : 'buyer';
  const state = homeState(facts);
  const hero = heroAmount(facts);
  const moving = movingTransfer(bridges, Date.now());
  const movingText = moving
    ? fill(moving.direction === 'out' ? t.home.movingOut : t.home.movingIn, {
        amount: formatAmount(Number(moving.amountUsdc), locale),
        place: bridgeChainMeta(moving.sourceChainKey).name,
      })
    : null;

  return (
    <div className="product-surface mx-auto max-w-[1120px] px-4 pb-24 pt-6 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10">
      <div className="min-w-0 max-w-[720px] divide-y divide-[var(--line)] [&>*]:py-8">
        <section aria-labelledby="money-balance" className="space-y-6">
          {/* Everything about money on one page: Balance, Agent, Deal guarantee (view 51, fifth round). */}
          <Segmented
            label={pages.tabs.label}
            value={tab}
            onChange={chooseTab}
            options={[{ value: 'balance', label: pages.tabs.balance }, { value: 'agent', label: pages.tabs.agent }, { value: 'guarantee', label: pages.tabs.guarantee }]}
            className="sm:max-w-[480px]"
          />
          {tab === 'agent' ? (
            <AgentsTab onSetUp={() => setSetupOpen(true)} withAgent={agents} agent={richerAgent} />
          ) : tab === 'guarantee' ? (
            <GuaranteeTab />
          ) : state === 'loading' ? (
            <div aria-busy="true" className="space-y-4">
              <div className={`h-4 w-28 ${SOFT}`} />
              <div className={`h-[52px] w-60 ${SOFT}`} />
              <div className={`h-12 w-72 ${SOFT}`} />
            </div>
          ) : state === 'error' ? (
            <div className="space-y-4">
              <h1 id="money-balance" className="text-[14px] font-semibold text-[var(--ink-secondary)]">{t.home.balanceLabel}</h1>
              <p role="alert" className="text-[15px] leading-relaxed text-[var(--ink)]">{t.home.loadError}</p>
              <button type="button" onClick={balances.refetch} className={SECONDARY}>{t.home.tryAgain}</button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <h1 id="money-balance" className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-[13px] text-[var(--ink-secondary)]">{mm.one.yourBalance}<Hint>{pages.tips.balance}</Hint></span>
                  <span className="flex items-baseline gap-2 tabular-nums" dir="ltr">
                    {/* Counts to a new value; under reduced motion it fades instead. */}
                    <m.span
                      key={reduce ? hero : 'count'}
                      initial={{ opacity: reduce ? 0 : 1 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: dur.fast }}
                      className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ink)] sm:text-[40px]"
                    >
                      {/* A chosen local currency leads; USDC reads under it (view 51). */}
                      <AnimatedNumber value={hero} format={(value) => formatDisplay(value, display.currency, display.rate, locale).primary} />
                    </m.span>
                    {display.rate === null ? <>{' '}<span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span></> : null}
                  </span>
                  {display.rate !== null ? (
                    <span data-balance-usdc dir="ltr" className="block text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{formatBalance(hero, locale)} USDC</span>
                  ) : null}
                  <button type="button" data-where-it-is-open onClick={() => setWhereOpen(true)} className="inline-flex min-h-8 items-center text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                    {mm.one.whereItIs}<span aria-hidden className="ms-1 rtl:rotate-180">›</span>
                  </button>
                </h1>
                <NetworkHint />
              </div>
              <p role="status" aria-live="polite" className="flex items-start gap-2 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
                <span
                  aria-hidden
                  className="mt-[7px] size-2 shrink-0 rounded-full"
                  data-balance-dot
                  style={{ background: balances.error || movingText || state === 'empty' ? 'var(--ink-muted)' : 'var(--ink)' }}
                />
                {balances.error ? t.home.staleBalance : state === 'empty' ? t.home.empty : movingText ?? t.home.readyOnArc}
              </p>
              {balances.error ? <button type="button" onClick={balances.refetch} className={buttonClasses({ variant: 'secondary' })}>{t.home.tryAgain}</button> : null}
              {/* Add money is the one green button on the page (view 48). */}
              {/* On a phone Add money takes the full row, so no label wraps. */}
              <div data-money-actions className="grid grid-cols-2 gap-2 sm:max-w-[480px] sm:grid-cols-3 sm:gap-3 [&>a]:px-3 [&>a]:text-center [&>a]:leading-tight">
                <Link href={ADD_HREF} data-add-money className={`col-span-2 sm:col-span-1 ${buttonClasses({ variant: 'primary', size: 'lg' })}`}>{mp.addMoney}</Link>
                <Link href="/send" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{mp.send}</Link>
                <Link href={WITHDRAW_HREF} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{mp.withdraw}</Link>
              </div>
              {held && held !== '0' ? (
                <div className={`${CARD_CLASS} px-5 lg:px-6`}>
                  <dl>
                    <div data-held-in-deals className="flex min-h-[52px] items-center justify-between gap-3 py-3 text-[15px] tabular-nums">
                      <dt className="text-[var(--ink-secondary)]">{mp.heldLabel}</dt>
                      <dd className="font-medium text-[var(--ink)]">{formatAmount(Number(held), locale)} USDC</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              <Link href="/request" className={QUIET}>{mp.askForMoney}</Link>
            </div>
          )}
        </section>

        {tab === 'balance' ? (
          <>
            <SavedAddresses />

            <RecoveryRow />

            <RecentMoney />
          </>
        ) : null}
      </div>

      <HeldDealsCard />

      <WhereItIsSheet
        open={whereOpen}
        total={hero}
        parts={parts}
        held={Number(held ?? 0)}
        isWallet={isWallet}
        onClose={() => setWhereOpen(false)}
        onMoveToBalance={() => fromWhere(`${ADD_HREF}?mode=moveToBalance`)}
        onAddToPool={() => fromWhere(`${ADD_HREF}?mode=addToPool`)}
        onAgentToWallet={() => fromWhere(agentMoveHref('withdraw', richerAgent))}
        onAddToAgent={() => fromWhere(agentMoveHref('topUp', 'buyer'))}
      />
      <ActivationModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        activate={activation.activate}
        renameAgents={activation.renameAgents}
        activating={activation.activating}
        error={activation.error}
        activated={activation.activated}
        agents={activation.agents}
      />
    </div>
  );
}

/// On a wide screen, the deals holding your money beside the balance, the
/// most held first, with the total under them (view 48).
function HeldDealsCard() {
  const mp = useTranslations().moneyPage;
  const { locale } = useLocale();
  const deals = useHeldDeals();
  if (deals.length === 0) return null;
  const total = deals.reduce((sum, d) => sum + Number(d.held), 0);
  return (
    <aside aria-labelledby="money-held" data-held-deals className="hidden pt-8 lg:block">
      <h2 id="money-held" className="text-[17px] font-semibold text-[var(--ink)]">{mp.heldLabel}</h2>
      <ul className={`${CARD_CLASS} mt-3 divide-y divide-[var(--line)] px-5`}>
        {deals.map(({ deal, held }) => (
          <li key={deal.jobId}>
            <Link href={`/deals/${deal.jobId}`} className="flex min-h-16 items-center justify-between gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]">
              <span className="min-w-0">
                <span dir="auto" className="block truncate text-[15px] font-medium text-[var(--ink)]">{whatItIs(deal) || dealReference(deal.jobId)}</span>
                <span dir="ltr" className="block text-[13px] tabular-nums text-[var(--ink-secondary)]">{dealReference(deal.jobId)}</span>
              </span>
              <span className="shrink-0 text-[15px] font-medium tabular-nums text-[var(--ink)]">{formatAmount(Number(held), locale)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center justify-between gap-3 px-5 text-[15px] tabular-nums">
        <span className="text-[var(--ink-secondary)]">{mp.totalHeld}</span>
        <span className="font-semibold text-[var(--ink)]">{formatAmount(total, locale)} USDC</span>
      </p>
    </aside>
  );
}
