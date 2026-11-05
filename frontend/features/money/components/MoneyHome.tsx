'use client';
import { useCallback, useEffect, useState } from 'react';
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
import type { AgentKey, MoneyMove } from '../moneySheetModel';
import { MoneySheet } from './MoneySheet';
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
import { AddMoneySheet, type AddSheetMode } from './AddMoneySheet';
import { WhereItIsSheet } from './WhereItIsSheet';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatDisplay } from '../displayCurrency';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';

type MoneyTab = 'balance' | 'agents';
const TAB_KEY = 'karwan:money:tab';

const SECONDARY = buttonClasses({ variant: 'secondary' });
const QUIET =
  'inline-flex min-h-11 items-center rounded-[10px] px-3 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const SOFT = 'bg-[var(--raised)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';

export function MoneyHome() {
  const gate = useTranslations().profile.signInGate;
  return (
    <AuthGuard gateTag={gate.tag} gateBody={gate.body}>
      <MoneyHomeInner />
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
  const held = useHeldInDeals();
  const [tab, setTab] = useState<MoneyTab>('balance');
  const { locale } = useLocale();
  const display = useDisplayCurrency();
  const reduce = useHydratedReducedMotion();
  const balances = useMoneyBalances();
  const activation = useActivation();
  const { bridges } = useBridges();
  const [sheet, setSheet] = useState<{ move: MoneyMove; agent: AgentKey } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [addSheet, setAddSheet] = useState<AddSheetMode | null>(null);
  const [landedNote, setLandedNote] = useState<string | null>(null);
  const [whereOpen, setWhereOpen] = useState(false);
  const isWallet = useAuth().method === 'web3';

  // The landed note reads for five seconds, then leaves.
  useEffect(() => {
    if (!landedNote) return;
    const timer = setTimeout(() => setLandedNote(null), 5000);
    return () => clearTimeout(timer);
  }, [landedNote]);

  // The last tab is a per-device convenience; storage may be unavailable.
  useEffect(() => {
    try {
      if (localStorage.getItem(TAB_KEY) === 'agents') setTab('agents');
    } catch {
      /* private mode */
    }
  }, []);
  const chooseTab = useCallback((next: MoneyTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  // One balance (view 51, third round): what sits with the agent counts too.
  const agents = (balances.buyer ?? 0) + (balances.seller ?? 0);
  const facts = { balance: balances.balance, pool: balances.pool, agents, loading: balances.loading, error: balances.error };
  const parts = whereItIs(facts);
  if (balances.activated && !parts.some((p) => p.part === 'agent')) parts.push({ part: 'agent', amount: 0 });
  // The next sheet rises once Where it is has gone down, so only one is ever open.
  const fromWhere = (open: () => void) => {
    setWhereOpen(false);
    window.setTimeout(open, dur.sheet * 1000 + 40);
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
          {/* Balance and Agents behind one switch (view 51). */}
          <Segmented
            label={mm.tabs.label}
            value={tab}
            onChange={chooseTab}
            options={[{ value: 'balance', label: mm.tabs.balance }, { value: 'agents', label: mm.tabs.agents }]}
            className="sm:max-w-[480px]"
          />
          {tab === 'agents' ? (
            <AgentsTab onSetUp={() => setSetupOpen(true)} />
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
                  <span className="block text-[13px] text-[var(--ink-secondary)]">{mm.one.yourBalance}</span>
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
                <button type="button" onClick={() => setAddSheet('add')} className={`col-span-2 sm:col-span-1 ${buttonClasses({ variant: 'primary', size: 'lg' })}`}>{mp.addMoney}</button>
                <Link href="/send" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{mp.send}</Link>
                <Link href="/bridge?direction=out" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{mp.withdraw}</Link>
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

      <AddMoneySheet
        open={addSheet !== null}
        mode={addSheet ?? 'add'}
        onClose={() => setAddSheet(null)}
        onLanded={(note) => setLandedNote(note)}
      />
      {landedNote ? (
        <p role="status" data-landed-note className="fixed inset-x-4 bottom-6 z-40 mx-auto flex max-w-[360px] items-center gap-2.5 rounded-[14px] border border-[var(--line)] bg-[var(--raised)] px-4 py-3 text-[15px] font-medium text-[var(--ink)] shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
          <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--canvas)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </span>
          {landedNote}
        </p>
      ) : null}
      <WhereItIsSheet
        open={whereOpen}
        total={hero}
        parts={parts}
        held={Number(held ?? 0)}
        isWallet={isWallet}
        onClose={() => setWhereOpen(false)}
        onMoveToBalance={() => { fromWhere(() => setAddSheet('moveToBalance')); }}
        onAddToPool={() => { fromWhere(() => setAddSheet('addToPool')); }}
        onAgentToWallet={() => { fromWhere(() => setSheet({ move: 'withdraw', agent: richerAgent })); }}
        onAddToAgent={() => { fromWhere(() => setSheet({ move: 'topUp', agent: 'buyer' })); }}
      />
      <MoneySheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        move={sheet?.move ?? 'topUp'}
        agent={sheet?.agent ?? 'buyer'}
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
