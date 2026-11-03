'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { m } from 'motion/react';
import { arcChain } from '@/core/wagmi';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { CopyAddress } from '@/shared/components/CopyAddress';
import { NetworkHint } from '@/shared/components/NetworkContext';
import { useActivation } from '@/shared/hooks/useActivation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { dur } from '@/shared/motion/tokens';
import { fill } from '@/features/deals/workspace/presentation';
import { bridgeChainMeta, useBridges } from '@/features/bridge/hooks/useBridge';
import { formatAmount, formatBalance, heroAmount, homeState, movingTransfer } from '../balanceModel';
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
  const held = useHeldInDeals();
  const [agentsOpen, setAgentsOpen] = useState(false);
  const { locale } = useLocale();
  const auth = useAuth();
  const reduce = useHydratedReducedMotion();
  const balances = useMoneyBalances();
  const activation = useActivation();
  const { bridges } = useBridges();
  const [sheet, setSheet] = useState<{ move: MoneyMove; agent: AgentKey } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const facts = { balance: balances.balance, pool: balances.pool, loading: balances.loading, error: balances.error };
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
        <section aria-labelledby="money-balance" className="space-y-4">
          {state === 'loading' ? (
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
                  <span className="block text-[13px] text-[var(--ink-secondary)]">{t.home.balanceLabel}</span>
                  <span className="flex items-baseline gap-2 tabular-nums">
                    {/* Counts to a new value; under reduced motion it fades instead. */}
                    <m.span
                      key={reduce ? hero : 'count'}
                      initial={{ opacity: reduce ? 0 : 1 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: dur.fast }}
                      className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ink)] sm:text-[40px]"
                    >
                      <AnimatedNumber value={hero} format={(value) => formatBalance(value, locale)} />
                    </m.span>
                    {' '}<span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span>
                  </span>
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
                <Link href="/bridge?intent=add" className={`col-span-2 sm:col-span-1 ${buttonClasses({ variant: 'primary', size: 'lg' })}`}>{mp.addMoney}</Link>
                <Link href="/send" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{mp.send}</Link>
                <Link href="/bridge?direction=out" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{mp.withdraw}</Link>
              </div>
              {(held && held !== '0') || balances.pool > 0 ? (
                <div className={`${CARD_CLASS} px-5 lg:px-6`}>
                  <dl className="divide-y divide-[var(--line)]">
                    {held && held !== '0' ? (
                      <div data-held-in-deals className="flex min-h-[52px] items-center justify-between gap-3 py-3 text-[15px] tabular-nums">
                        <dt className="text-[var(--ink-secondary)]">{mp.heldLabel}</dt>
                        <dd className="font-medium text-[var(--ink)]">{formatAmount(Number(held), locale)} USDC</dd>
                      </div>
                    ) : null}
                    {balances.pool > 0 ? (
                      <div data-gateway-balance className="flex min-h-[52px] items-center justify-between gap-3 py-3 text-[15px] tabular-nums">
                        <dt className="text-[var(--ink-secondary)]">{t.home.gatewayBalance}</dt>
                        <dd className="font-medium text-[var(--ink)]">{formatBalance(balances.pool, locale)} USDC</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ) : null}
              <Link href="/request" className={QUIET}>{mp.askForMoney}</Link>
            </div>
          )}
        </section>

        {/* One balance leads; the agents fold under one row (one wallet doctrine, view 44). */}
        <Disclosure id="agents" title={mp.agentsRow} open={agentsOpen} onToggle={() => setAgentsOpen((value) => !value)}>
        <div className="scroll-mt-24 space-y-4">
          <p className="text-[14px] text-[var(--ink-secondary)] font-medium">{t.home.agentsLine}</p>
          {balances.activationLoading ? (
            <div aria-busy="true" className="space-y-3">
              <div className={`h-14 ${SOFT}`} />
              <div className={`h-14 ${SOFT}`} />
            </div>
          ) : !balances.activated ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--line)] py-4">
              <p className="text-[15px] text-[var(--ink)]">{t.home.agentsNotSetUp}</p>
              <button type="button" onClick={() => setSetupOpen(true)} className={SECONDARY}>{t.home.setUpAgents}</button>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {(['buyer', 'seller'] as const).map((agent) => {
                const amount = agent === 'buyer' ? balances.buyer : balances.seller;
                const custom = agent === 'buyer' ? activation.agents?.buyerName : activation.agents?.sellerName;
                const name = custom || (agent === 'buyer' ? t.home.buyingAgent : t.home.sellingAgent);
                const nameId = `money-agent-${agent}`;
                return (
                  <li key={agent} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
                    <span className="min-w-0 flex-1">
                      <span id={nameId} className="block text-[15px] font-semibold text-[var(--ink)]">{name}</span>
                      <span className="block text-[14px] tabular-nums text-[var(--ink-secondary)] font-medium">
                        {amount === null ? ' ' : `${formatBalance(amount, locale)} USDC`}
                      </span>
                    </span>
                    <button type="button" aria-describedby={nameId} onClick={() => setSheet({ move: 'topUp', agent })} className={QUIET}>
                      {t.home.topUp}
                    </button>
                    <button type="button" aria-describedby={nameId} onClick={() => setSheet({ move: 'withdraw', agent })} className={QUIET}>
                      {t.home.withdraw}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </Disclosure>

        <SavedAddresses />

        <RecoveryRow />

        <RecentMoney />

        {/* Amounts stay in USDC until local currencies are supported (shown, not clickable). */}
        <div data-amounts-in className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px] font-medium text-[var(--ink)]">{t.home.showAmountsIn}</span>
          <span className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-[var(--ink)]">USDC</span>
            <span className="rounded-full bg-[var(--raised)] px-2.5 py-1 text-[14px] font-semibold text-[var(--ink-secondary)]">{t.home.localCurrencySoon}</span>
          </span>
        </div>

        <ProofOnArc address={auth.address} agents={balances.activated ? balances.agents : null} />
      </div>

      <HeldDealsCard />

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

function Disclosure({ id, title, open, onToggle, children }: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-start text-[17px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
        >
          {title}
          <span aria-hidden className={`text-[16px] text-[var(--ink-secondary)] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
      </h2>
      {open ? <div id={`${id}-body`} className="mt-4">{children}</div> : null}
    </section>
  );
}

/// The internals, one tap away: which network, and the addresses behind the
/// balance and the agents.
function ProofOnArc({ address, agents }: {
  address: string | null;
  agents: { buyer: string; seller: string } | null;
}) {
  const t = useTranslations().money.home;
  const [open, setOpen] = useState(false);
  const item = (label: string, value: ReactNode) => (
    <div key={label}>
      <dt className="text-[14px] text-[var(--ink-secondary)] font-medium">{label}</dt>
      <dd className="mt-1 text-[14px] text-[var(--ink)]">{value}</dd>
    </div>
  );
  return (
    <Disclosure id="money-proof" title={t.proofTitle} open={open} onToggle={() => setOpen((value) => !value)}>
      <dl className="space-y-4">
        {item(t.networkLabel, arcChain.name)}
        {address ? item(t.walletAddress, <CopyAddress value={address} />) : null}
        {agents ? item(t.buyingAgentAddress, <CopyAddress value={agents.buyer} />) : null}
        {agents ? item(t.sellingAgentAddress, <CopyAddress value={agents.seller} />) : null}
      </dl>
    </Disclosure>
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
