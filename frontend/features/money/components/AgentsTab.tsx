'use client';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useActivation } from '@/shared/hooks/useActivation';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { formatBalance } from '../balanceModel';
import { formatDisplay } from '../displayCurrency';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import type { AgentKey } from '../moneySheetModel';
import { RecentMoney } from './RecentMoney';

const QUIET =
  'inline-flex min-h-11 items-center rounded-[10px] px-3 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const SOFT = 'bg-[var(--raised)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';

function AgentGlyph() {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--raised)] text-[var(--ink)]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="8" width="14" height="11" rx="3" />
        <path d="M12 4v4M9.5 13h.01M14.5 13h.01" strokeWidth="2.4" />
      </svg>
    </span>
  );
}

/// What the agents hold, their two moves, each agent with what it does, and
/// what they spent (view 51). Agents not set up yet get the one setup button.
export function AgentsTab({ onMove, onSetUp }: { onMove: (move: 'topUp' | 'withdraw', agent: AgentKey) => void; onSetUp: () => void }) {
  const t = useTranslations();
  const copy = t.moneyMove;
  const home = t.money.home;
  const { locale } = useLocale();
  const balances = useMoneyBalances();
  const activation = useActivation();
  const { currency, rate } = useDisplayCurrency();

  if (balances.activationLoading) {
    return (
      <div aria-busy="true" className="space-y-3">
        <div className={`h-12 w-56 ${SOFT}`} />
        <div className={`h-14 ${SOFT}`} />
        <div className={`h-14 ${SOFT}`} />
      </div>
    );
  }

  if (!balances.activated) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--line)] py-4">
        <p className="text-[15px] text-[var(--ink)]">{home.agentsNotSetUp}</p>
        <button type="button" onClick={onSetUp} className={buttonClasses({ variant: 'secondary' })}>{home.setUpAgents}</button>
      </div>
    );
  }

  const total = (balances.buyer ?? 0) + (balances.seller ?? 0);
  const shown = formatDisplay(total, currency, rate, locale);

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <h1 id="money-balance" className="space-y-1.5">
          <span className="block text-[13px] text-[var(--ink-secondary)]">{copy.home.agentsHold}</span>
          <span className="flex items-baseline gap-2 tabular-nums" dir="ltr">
            <span className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ink)] sm:text-[40px]">
              {shown.unit ? <AnimatedNumber value={total} format={(value) => formatBalance(value, locale)} /> : shown.primary}
            </span>
            {shown.unit ? <span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span> : null}
          </span>
          {shown.secondary ? <span className="block text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]" dir="ltr">{shown.secondary}</span> : null}
        </h1>
        <div data-agent-actions className="grid grid-cols-2 gap-2 sm:max-w-[360px] sm:gap-3">
          <button type="button" onClick={() => onMove('topUp', 'buyer')} className={buttonClasses({ variant: 'primary', size: 'lg' })}>{copy.agents.topUp}</button>
          <button type="button" onClick={() => onMove('withdraw', 'seller')} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{copy.agents.withdraw}</button>
        </div>
        <ul className="space-y-2">
          {(['buyer', 'seller'] as const).map((agent) => {
            const amount = agent === 'buyer' ? balances.buyer : balances.seller;
            const custom = agent === 'buyer' ? activation.agents?.buyerName : activation.agents?.sellerName;
            const name = custom || (agent === 'buyer' ? home.buyingAgent : home.sellingAgent);
            const nameId = `money-agent-${agent}`;
            return (
              <li key={agent} className={`${CARD_CLASS} flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3`}>
                <AgentGlyph />
                <span className="min-w-0 flex-1">
                  <span id={nameId} className="block text-[15px] font-semibold text-[var(--ink)]">{name}</span>
                  <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{agent === 'buyer' ? copy.home.buyingDoes : copy.home.sellingDoes}</span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums text-[var(--ink)]" dir="ltr">{amount === null ? ' ' : formatBalance(amount, locale)}</span>
                <span className="flex w-full justify-end gap-1 sm:w-auto">
                  <button type="button" aria-describedby={nameId} onClick={() => onMove('topUp', agent)} className={QUIET}>{home.topUp}</button>
                  <button type="button" aria-describedby={nameId} onClick={() => onMove('withdraw', agent)} className={QUIET}>{home.withdraw}</button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <RecentMoney agentsOnly />
    </div>
  );
}
