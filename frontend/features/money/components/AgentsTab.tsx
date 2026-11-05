'use client';
import { useId, useState } from 'react';
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

const SOFT = 'bg-[var(--raised)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';
const RECORD_CHECK_USDC = 0.005;

/// The agent has no balance of its own on screen (view 51, third round): what
/// it may spend each week on checks, what it spent and what is left, then each
/// spend with its receipt. Agents not set up yet get the one setup button.
export function AgentsTab({ onSetUp }: { onSetUp: () => void }) {
  const t = useTranslations();
  const one = t.moneyMove.one;
  const home = t.money.home;
  const { locale } = useLocale();
  const balances = useMoneyBalances();
  const { limit, loading, save } = useAgentLimit();
  const [open, setOpen] = useState(false);

  if (balances.activationLoading || (balances.activated && loading)) {
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

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <h1 id="money-balance" className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[13px] text-[var(--ink-secondary)]">{one.canSpend}<Hint>{one.limitTip}</Hint></span>
          <span className="flex items-baseline gap-2 tabular-nums" dir="ltr">
            <span data-agent-limit className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ink)] sm:text-[40px]">
              {limit ? formatAmount(limit.weeklyUsdc, locale) : ' '}
            </span>
            <span className="text-[17px] font-semibold text-[var(--ink-secondary)]">{one.aWeek}</span>
          </span>
        </h1>
        <button type="button" data-change-limit onClick={() => setOpen(true)} className={`w-full sm:max-w-[360px] ${buttonClasses({ variant: 'secondary', size: 'lg' })}`}>
          {one.changeLimit}
        </button>
        {limit ? (
          <dl className={`${CARD_CLASS} divide-y divide-[var(--line)] px-4 sm:max-w-[480px]`}>
            <div data-spent-week className="flex min-h-16 items-center justify-between gap-3 py-3">
              <dt className="min-w-0">
                <span className="block text-[15px] font-semibold text-[var(--ink)]">{one.spentWeek}</span>
                <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">
                  {fill(one.spentDetail, { checks: String(limit.recordChecks), searches: String(limit.webSearches) })}
                </span>
              </dt>
              <dd dir="ltr" className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatAmount(limit.spentUsdc, locale)} USDC</dd>
            </div>
            <div data-left-week className="flex min-h-16 items-center justify-between gap-3 py-3">
              <dt className="min-w-0">
                <span className="block text-[15px] font-semibold text-[var(--ink)]">{one.leftWeek}</span>
                <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{one.leftNote}</span>
              </dt>
              <dd dir="ltr" className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatAmount(limit.leftUsdc, locale)} USDC</dd>
            </div>
          </dl>
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
