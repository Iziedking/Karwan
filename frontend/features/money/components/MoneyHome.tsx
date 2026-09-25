'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { formatUnits } from 'viem';
import { arcChain } from '@/core/wagmi';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { CopyAddress } from '@/shared/components/CopyAddress';
import { NetworkContext } from '@/shared/components/NetworkContext';
import { useActivation } from '@/shared/hooks/useActivation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { dur } from '@/shared/motion/tokens';
import { fill } from '@/features/deals/workspace/presentation';
import { bridgeChainMeta, useBridges } from '@/features/bridge/hooks/useBridge';
import { CHAIN_META, ROW_KEYS, useChainBalances, type RowKey } from '@/features/balances/hooks/useChainBalances';
import { formatAmount, formatBalance, heroAmount, homeState, movingTransfer } from '../balanceModel';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import type { AgentKey, MoneyMove } from '../moneySheetModel';
import { MoneySheet } from './MoneySheet';
import { RecentMoney } from './RecentMoney';

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

/// One scrolling page: the balance, the agents, the last five movements, then
/// the per-network view and the proof, both closed until asked for.
function MoneyHomeInner() {
  const t = useTranslations().money;
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
              <h1 id="money-balance" className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.home.balanceLabel}</h1>
              <p role="alert" className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{t.home.loadError}</p>
              <button type="button" onClick={balances.refetch} className={SECONDARY}>{t.home.tryAgain}</button>
            </div>
          ) : (
            <>
              <h1 id="money-balance" className="space-y-2">
                <span className="block text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.home.balanceLabel}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  {/* Counts to a new value; under reduced motion it fades instead. */}
                  <motion.span
                    key={reduce ? hero : 'count'}
                    initial={{ opacity: reduce ? 0 : 1 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: dur.fast }}
                    className="text-[44px] font-semibold leading-none tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[56px]"
                  >
                    <AnimatedNumber value={hero} format={(value) => formatBalance(value, locale)} />
                  </motion.span>
                  <span className="text-[18px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
                </span>
              </h1>
              <p role="status" aria-live="polite" className="flex items-start gap-2 text-[15px] leading-relaxed text-[var(--lp-dark)]">
                <span
                  aria-hidden
                  className="mt-[7px] size-2 shrink-0 rounded-full"
                  style={{ background: movingText || state === 'empty' ? 'var(--lp-text-sub)' : 'var(--color-positive)' }}
                />
                {state === 'empty' ? t.home.empty : movingText ?? t.home.readyOnArc}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/bridge?intent=add" className={PRIMARY}>{t.home.add}</Link>
                <Link href="/bridge?intent=move" className={SECONDARY}>{t.home.move}</Link>
                <button type="button" onClick={() => setSheet({ move: 'send', agent: 'buyer' })} className={SECONDARY}>
                  {t.home.send}
                </button>
              </div>
              <NetworkContext />
            </>
          )}
        </section>

        <section id="agents" aria-labelledby="money-agents" className="scroll-mt-24 space-y-4">
          <div>
            <h2 id="money-agents" className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.home.agentsTitle}</h2>
            <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{t.home.agentsLine}</p>
          </div>
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
                      <span className="block text-[14px] tabular-nums text-[var(--lp-text-sub)]">
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
        </section>

        <RecentMoney />

        <ByNetwork address={(auth.address ?? undefined) as `0x${string}` | undefined} balance={balances.balance} pool={balances.pool} />

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
          className="flex min-h-11 w-full items-center justify-between gap-3 text-start text-[20px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {title}
          <span aria-hidden className={`text-[16px] text-[var(--lp-text-sub)] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
      </h2>
      {open ? <div id={`${id}-body`} className="mt-4">{children}</div> : null}
    </section>
  );
}

function amountOf(data: { value: bigint; decimals: number } | undefined): number | null {
  return data ? Number(formatUnits(data.value, data.decimals)) : null;
}

/// Per-network balances, for the people who want them. Reads nothing until it
/// is opened. Money on other networks is shown apart from the balance, because
/// it is not spendable here until it is added.
function ByNetwork({ address, balance, pool }: { address?: `0x${string}`; balance: number | null; pool: number }) {
  const t = useTranslations().money.home;
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const chains = useChainBalances(address, open);
  const elsewhere = ROW_KEYS.filter((key): key is Exclude<RowKey, 'arc'> => key !== 'arc')
    .map((key) => ({ key, amount: amountOf(chains[key].data) }))
    .filter((row): row is { key: Exclude<RowKey, 'arc'>; amount: number } => row.amount !== null && row.amount > 0);
  const line = (label: string, amount: number | null) => (
    <div key={label} className="flex items-center justify-between gap-3 py-3">
      <dt className="text-[15px] text-[var(--lp-dark)]">{label}</dt>
      <dd className="text-[15px] tabular-nums text-[var(--lp-dark)]">{amount === null ? ' ' : `${formatBalance(amount, locale)} USDC`}</dd>
    </div>
  );
  return (
    <Disclosure id="money-networks" title={t.byNetworkTitle} open={open} onToggle={() => setOpen((value) => !value)}>
      <div className="space-y-6">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.inYourBalance}</h3>
          <dl className="divide-y divide-[var(--lp-border-light)]">
            {line(CHAIN_META.arc.name, balance)}
            {pool > 0 ? line(t.heldAnyNetwork, pool) : null}
          </dl>
        </div>
        {elsewhere.length > 0 ? (
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.otherNetworks}</h3>
            <dl className="divide-y divide-[var(--lp-border-light)]">
              {elsewhere.map((row) => line(CHAIN_META[row.key].name, row.amount))}
            </dl>
          </div>
        ) : null}
      </div>
    </Disclosure>
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
      <dt className="text-[13px] text-[var(--lp-text-sub)]">{label}</dt>
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
