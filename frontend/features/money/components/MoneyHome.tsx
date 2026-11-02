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
import { useHeldInDeals } from '../useHeldInDeals';

const PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-[10px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors duration-200 hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2';
const SECONDARY =
  'inline-flex min-h-12 items-center justify-center rounded-[10px] border border-[var(--lp-outline-strong)] px-5 text-[15px] font-medium text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const QUIET =
  'inline-flex min-h-11 items-center rounded-[10px] px-3 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-workspace-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const SOFT = 'bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';

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
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <div className="divide-y divide-[var(--lp-border-light)] [&>*]:py-8">
        <section aria-labelledby="money-balance" className="space-y-4">
          {state === 'loading' ? (
            <div aria-busy="true" className="space-y-4">
              <div className={`h-4 w-28 ${SOFT}`} />
              <div className={`h-[52px] w-60 ${SOFT}`} />
              <div className={`h-12 w-72 ${SOFT}`} />
            </div>
          ) : state === 'error' ? (
            <div className="space-y-4">
              <h1 id="money-balance" className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.home.balanceLabel}</h1>
              <p role="alert" className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{t.home.loadError}</p>
              <button type="button" onClick={balances.refetch} className={SECONDARY}>{t.home.tryAgain}</button>
            </div>
          ) : (
            <div className="space-y-4 rounded-[24px] border border-[var(--lp-border-light)] bg-[linear-gradient(115deg,var(--hero-from),var(--hero-to)_70%)] p-5 shadow-[var(--hero-shadow)] sm:p-6">
              <div className="-mb-2 flex justify-end"><NetworkHint /></div>
              <h1 id="money-balance" className="space-y-2">
                <span className="block text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.home.balanceLabel}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  {/* Counts to a new value; under reduced motion it fades instead. */}
                  <m.span
                    key={reduce ? hero : 'count'}
                    initial={{ opacity: reduce ? 0 : 1 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: dur.fast }}
                    className="text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[40px]"
                  >
                    <AnimatedNumber value={hero} format={(value) => formatBalance(value, locale)} />
                  </m.span>
                  {' '}<span className="text-[15px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
                </span>
              </h1>
              <p role="status" aria-live="polite" className="flex items-start gap-2 text-[15px] leading-relaxed text-[var(--lp-dark)]">
                <span
                  aria-hidden
                  className="mt-[7px] size-2 shrink-0 rounded-full"
                  style={{ background: balances.error || movingText || state === 'empty' ? 'var(--lp-text-sub)' : 'var(--color-positive)' }}
                />
                {balances.error ? t.home.staleBalance : state === 'empty' ? t.home.empty : movingText ?? t.home.readyOnArc}
              </p>
              {balances.error ? <button type="button" onClick={balances.refetch} className={SECONDARY}>{t.home.tryAgain}</button> : null}
              {held && held !== '0' ? (
                <p data-held-in-deals className="text-[15px] font-medium tabular-nums text-[var(--lp-dark)]">
                  {fill(mp.heldInDeals, { amount: formatAmount(Number(held), locale) })}
                </p>
              ) : null}
              {balances.pool > 0 ? (
                <p data-gateway-balance className="flex items-center justify-between gap-3 text-[15px] font-medium tabular-nums text-[var(--lp-dark)]">
                  <span>{t.home.gatewayBalance}</span>
                  <span>{formatBalance(balances.pool, locale)} USDC</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Link href="/bridge?intent=add" className={PRIMARY}>{mp.addMoney}</Link>
                <Link href="/send" className={SECONDARY}>{mp.send}</Link>
                <Link href="/bridge?direction=out" className={SECONDARY}>{mp.withdraw}</Link>
              </div>
              <Link href="/request" className={QUIET}>{mp.askForMoney}</Link>
            </div>
          )}
        </section>

        {/* One balance leads; the agents fold under one row (one wallet doctrine, view 44). */}
        <Disclosure id="agents" title={mp.agentsRow} open={agentsOpen} onToggle={() => setAgentsOpen((value) => !value)}>
        <div className="scroll-mt-24 space-y-4">
          <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">{t.home.agentsLine}</p>
          {balances.activationLoading ? (
            <div aria-busy="true" className="space-y-3">
              <div className={`h-14 ${SOFT}`} />
              <div className={`h-14 ${SOFT}`} />
            </div>
          ) : !balances.activated ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--lp-border-light)] py-4">
              <p className="text-[15px] text-[var(--lp-dark)]">{t.home.agentsNotSetUp}</p>
              <button type="button" onClick={() => setSetupOpen(true)} className={SECONDARY}>{t.home.setUpAgents}</button>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
              {(['buyer', 'seller'] as const).map((agent) => {
                const amount = agent === 'buyer' ? balances.buyer : balances.seller;
                const custom = agent === 'buyer' ? activation.agents?.buyerName : activation.agents?.sellerName;
                const name = custom || (agent === 'buyer' ? t.home.buyingAgent : t.home.sellingAgent);
                const nameId = `money-agent-${agent}`;
                return (
                  <li key={agent} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
                    <span className="min-w-0 flex-1">
                      <span id={nameId} className="block text-[15px] font-semibold text-[var(--lp-dark)]">{name}</span>
                      <span className="block text-[14px] tabular-nums text-[var(--lp-text-sub)] font-medium">
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
          <span className="text-[15px] font-medium text-[var(--lp-dark)]">{t.home.showAmountsIn}</span>
          <span className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-[var(--lp-dark)]">USDC</span>
            <span className="rounded-full bg-[var(--lp-light)] px-2.5 py-1 text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.home.localCurrencySoon}</span>
          </span>
        </div>

        <ProofOnArc address={auth.address} agents={balances.activated ? balances.agents : null} />
      </div>

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
          className="flex min-h-11 w-full items-center justify-between gap-3 text-start text-[17px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {title}
          <span aria-hidden className={`text-[16px] text-[var(--lp-text-sub)] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}>⌄</span>
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
      <dt className="text-[14px] text-[var(--lp-text-sub)] font-medium">{label}</dt>
      <dd className="mt-1 text-[14px] text-[var(--lp-dark)]">{value}</dd>
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
