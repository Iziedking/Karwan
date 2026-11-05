'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Hint } from '@/shared/components/Hint';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { formatAmount } from '../balanceModel';
import { useAgentLimit } from '../hooks/useAgentLimit';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import { RecentMoney } from './RecentMoney';
import { agentMoveHref } from '../moneyRoutes';
import type { AgentKey } from '../moneySheetModel';

const SOFT = 'bg-[var(--raised)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';
const RECORD_CHECK_USDC = 0.005;

/// Money's Agent tab (view 51, fifth round), laid out like Balance: the money
/// with your agent (still counted in Your balance), Top up, Withdraw and
/// Change limit, then this week in one card and each spend with its receipt.
/// Agents not set up yet get the one setup button.
export function AgentsTab({ onSetUp, withAgent, agent }: { onSetUp: () => void; withAgent: number; agent: AgentKey }) {
  const t = useTranslations();
  const one = t.moneyMove.one;
  const a = t.moneyPages.agent;
  const home = t.money.home;
  const { locale } = useLocale();
  const balances = useMoneyBalances();
  const { limit, loading, failed, retry, save } = useAgentLimit();
  const [open, setOpen] = useState(false);

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

  const spentShare = limit && limit.weeklyUsdc > 0 ? Math.min(1, limit.spentUsdc / limit.weeklyUsdc) : 0;

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <h1 id="money-balance" className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[13px] text-[var(--ink-secondary)]">{a.withAgent}<Hint>{t.moneyPages.tips.agent}</Hint></span>
          <span className="flex items-baseline gap-2 tabular-nums" dir="ltr">
            <span data-agent-money className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ink)] sm:text-[40px]">
              {formatAmount(withAgent, locale)}
            </span>
            <span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span>
          </span>
          {limit ? (
            <span data-agent-limit className="block text-[13px] font-medium text-[var(--ink-secondary)]">{fill(a.line, { limit: formatAmount(limit.weeklyUsdc, locale) })}</span>
          ) : null}
        </h1>
        <div data-agent-actions className="grid grid-cols-3 gap-2 sm:max-w-[480px] sm:gap-3">
          <Link href={agentMoveHref('topUp', 'buyer')} className={buttonClasses({ size: 'lg', className: 'px-2' })}>{a.topUp}</Link>
          <Link href={agentMoveHref('withdraw', agent)} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'px-2' })}>{a.withdraw}</Link>
          <button type="button" data-change-limit disabled={!limit} onClick={() => setOpen(true)} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'px-2 leading-tight' })}>
            {a.changeLimit}
          </button>
        </div>
        {loading ? (
          <div className={`h-24 sm:max-w-[480px] ${SOFT}`} />
        ) : limit ? (
          <div data-spent-week className={`${CARD_CLASS} space-y-2.5 px-5 py-4 sm:max-w-[480px]`}>
            <p className="flex items-center justify-between gap-3 text-[14px]">
              <span className="text-[var(--ink-secondary)]">{one.spentWeek}</span>
              <span dir="ltr" className="font-semibold tabular-nums text-[var(--ink)]">
                {fill(a.spentOf, { spent: formatAmount(limit.spentUsdc, locale), limit: formatAmount(limit.weeklyUsdc, locale) })}
              </span>
            </p>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
              <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${Math.round(spentShare * 100)}%` }} />
            </div>
            <p data-left-week className="text-[13px] font-medium text-[var(--ink-secondary)]">
              {fill(a.leftLine, { left: formatAmount(limit.leftUsdc, locale), checks: String(limit.recordChecks), searches: String(limit.webSearches) })}
            </p>
          </div>
        ) : failed ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 sm:max-w-[480px]">
            <p className="text-[15px] font-medium text-[var(--ink)]">{a.limitError}</p>
            <button type="button" onClick={retry} className={buttonClasses({ variant: 'secondary' })}>{home.tryAgain}</button>
          </div>
        ) : null}
      </div>
      <RecentMoney agentsOnly />
      {limit ? (
        <LimitSheet
          open={open}
          current={limit.weeklyUsdc}
          choices={limit.choices}
          saving={save.isPending}
          failed={save.isError}
          onClose={() => setOpen(false)}
          onSave={(weeklyUsdc) => save.mutate(weeklyUsdc, { onSuccess: () => setOpen(false) })}
        />
      ) : null}
    </div>
  );
}

function LimitSheet({ open, current, choices, saving, failed, onClose, onSave }: {
  open: boolean;
  current: number;
  choices: number[];
  saving: boolean;
  failed: boolean;
  onClose: () => void;
  onSave: (weeklyUsdc: number) => void;
}) {
  const one = useTranslations().moneyMove.one;
  const { locale } = useLocale();
  const titleId = useId();
  const [picked, setPicked] = useState(current);

  return (
    <ConfirmSheetShell open={open} labelledBy={titleId} busy={saving} onClose={onClose}>
      <h2 id={titleId} className="mb-1 flex items-center gap-2 text-[20px] font-semibold text-[var(--ink)]">
        {one.limitTitle}
        <Hint>{one.limitTip}</Hint>
      </h2>
      <p className="mb-4 text-[14px] text-[var(--ink-secondary)]">{one.limitLead}</p>
      <div role="radiogroup" aria-labelledby={titleId} data-limit-choices className="space-y-2">
        {choices.map((usdc) => {
          const checked = picked === usdc;
          return (
            <button
              key={usdc}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setPicked(usdc)}
              className={`flex min-h-[60px] w-full items-center gap-3 rounded-[var(--radius-card)] border bg-[var(--surface)] px-4 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${checked ? 'border-[var(--ink)]' : 'border-[var(--line)] hover:bg-[var(--raised)]'}`}
            >
              <span className="min-w-0 flex-1">
                <span dir="ltr" className="block text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatAmount(usdc, locale)} USDC</span>
                <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">
                  {fill(one.about, { n: new Intl.NumberFormat(locale).format(Math.floor(usdc / RECORD_CHECK_USDC)) })}
                </span>
              </span>
              <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] ${checked ? 'border-[var(--ink)]' : 'border-[var(--line-strong)]'}`}>
                {checked ? <span className="size-2.5 rounded-full bg-[var(--ink)]" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      {failed ? <p role="alert" className="mt-3 text-[14px] text-[var(--ink)]">{one.saveFailed}</p> : null}
      <button
        type="button"
        disabled={saving || picked === current}
        onClick={() => onSave(picked)}
        className={`mt-5 w-full ${buttonClasses({ variant: 'primary', size: 'lg' })}`}
      >
        {one.save}
      </button>
      <p className="mt-3 text-[13px] font-medium text-[var(--ink-muted)]">{one.limitNote}</p>
    </ConfirmSheetShell>
  );
}
