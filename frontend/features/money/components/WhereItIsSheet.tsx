'use client';
import { useId } from 'react';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Hint } from '@/shared/components/Hint';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { formatAmount, formatBalance, type BalancePart } from '../balanceModel';

const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-[var(--raised)] px-3.5 text-[14px] font-medium text-[var(--ink)] hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';

/// The parts of the one balance (view 51, third round): what is ready to send,
/// a wallet account's Transfer balance and what still sits with the agent,
/// each with the move that belongs to it. Money held in deals is not counted.
export function WhereItIsSheet({ open, total, parts, held, isWallet, onClose, onMoveToBalance, onAddToPool, onAgentToWallet, onAddToAgent }: {
  open: boolean;
  total: number;
  parts: Array<{ part: BalancePart; amount: number }>;
  held: number;
  isWallet: boolean;
  onClose: () => void;
  onMoveToBalance: () => void;
  onAddToPool: () => void;
  onAgentToWallet: () => void;
  onAddToAgent: () => void;
}) {
  const t = useTranslations();
  const one = t.moneyMove.one;
  const { locale } = useLocale();
  const titleId = useId();
  const names: Record<BalancePart, { name: string; note: string }> = {
    ready: { name: one.ready, note: one.readyNote },
    transfer: { name: one.transfer, note: one.transferNote },
    agent: { name: one.withAgent, note: one.withAgentNote },
  };

  return (
    <ConfirmSheetShell open={open} labelledBy={titleId} busy={false} onClose={onClose}>
      <h2 id={titleId} className="mb-1 text-[20px] font-semibold text-[var(--ink)]">{one.whereItIs}</h2>
      <p dir="auto" className="mb-4 text-[14px] tabular-nums text-[var(--ink-secondary)]">
        {one.yourBalance} · <span dir="ltr">{formatBalance(total, locale)} USDC</span>
      </p>
      <ul data-where-it-is className="space-y-2">
        {parts.map(({ part, amount }) => (
          <li key={part} data-part={part} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <div className="flex min-h-10 items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--ink)]">
                  {names[part].name}
                  {part === 'transfer' ? <Hint>{t.money.home.gatewayBalanceHint}</Hint> : null}
                </span>
                <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{names[part].note}</span>
              </span>
              <span dir="ltr" className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatBalance(amount, locale)}</span>
            </div>
            {part === 'transfer' && isWallet ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={onMoveToBalance} className={CHIP}>{t.moneyMove.home.moveToBalance}</button>
                <button type="button" onClick={onAddToPool} className={CHIP}>{t.moneyMove.home.addToIt}</button>
              </div>
            ) : null}
            {part === 'agent' ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={onAgentToWallet} className={CHIP}>{one.moveToWallet}</button>
                <button type="button" onClick={onAddToAgent} className={CHIP}>{one.addToAgent}</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {held > 0 ? (
        <p className="mt-3 text-[13px] font-medium text-[var(--ink-muted)]">{fill(one.heldNote, { amount: formatAmount(held, locale) })}</p>
      ) : null}
    </ConfirmSheetShell>
  );
}
