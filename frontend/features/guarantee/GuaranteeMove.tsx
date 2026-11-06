'use client';
import { useId, useState } from 'react';
import type { GuaranteeStep } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MoneyFrame } from '@/shared/components/MoneyFrame';
import { buttonClasses } from '@/shared/components/Button';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { AmountHero } from '@/features/money/components/AmountHero';
import { Keypad } from '@/features/money/components/Keypad';
import { pressKey } from '@/features/money/amountEntry';
import { chipAmount } from '@/features/money/moneySheetModel';
import { useAmountInput } from '@/features/money/hooks/useAmountInput';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { useGuarantee } from './useGuarantee';

const fillIn = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-[var(--raised)] px-3.5 text-[14px] font-medium text-[var(--ink)] hover:bg-[var(--line)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';

/// A Deal guarantee move as its own page (view 51, fifth round): add from your
/// balance, withdraw (it comes back after the waiting period), collect, or
/// keep it in. The result stays on the page until Done.
export function GuaranteeMove({ step, onClose }: { step: GuaranteeStep; onClose: () => void }) {
  const { locale, t } = useLocale();
  const money = useMoneyText();
  const g = t.moneyPages.guarantee;
  const c = t.dealGuarantee;
  const sheet = t.money.sheet;
  const entry = t.money.entry;
  const titleId = useId();
  const amountId = useId();
  const keypad = useMediaQuery('(pointer: coarse)');
  const wallet = useMoneyBalances().balance ?? 0;
  const { data: read, busy, run } = useGuarantee();
  // Only an open guarantee has amounts to move.
  const data: { freeUsdc: string; waitDays: number; comingBackUsdc: string } | null =
    read && read.available ? (read as unknown as { freeUsdc: string; waitDays: number; comingBackUsdc: string }) : null;
  const amt = useAmountInput();
  const { typed, setTyped } = amt;
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const withAmount = step === 'put_up' || step === 'take_out';
  const source = step === 'put_up' ? wallet : Number(data?.freeUsdc ?? 0);
  const amount = amt.usdc;
  const waitDays = data?.waitDays ?? 0;
  const readyOn = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(Date.now() + waitDays * 86_400_000));
  const title = step === 'put_up' ? g.addTitle : step === 'take_out' ? g.withdrawTitle : step === 'collect' ? money.fill(c.sheets.collect.title, { amount: data?.comingBackUsdc ?? 0 }) : money.fill(c.sheets.cancel.title, { amount: data?.comingBackUsdc ?? 0 });
  const shown = { amount: amount ?? 0 };
  const exact = { exact: true };
  const cta = step === 'put_up' ? money.fill(g.addCta, shown, {}, exact) : step === 'take_out' ? money.fill(g.withdrawCta, shown, {}, exact) : step === 'collect' ? c.sheets.collect.confirm : c.sheets.cancel.confirm;
  const blocked = busy || !data || (withAmount && (amount === null || amount <= 0 || amount > source + 1e-9));

  async function confirm() {
    setError(null);
    const outcome = await run(step, withAmount ? String(amount) : undefined);
    if (outcome.ok) {
      setDone(
        step === 'put_up' ? money.fill(g.doneAdd, shown, {}, exact)
          : step === 'take_out' ? money.fill(g.doneWithdraw, shown, { date: readyOn }, exact)
            : step === 'collect' ? c.done.collect : c.done.cancel,
      );
    } else if (!outcome.cancelled) setError(outcome.error);
  }

  return (
    <MoneyFrame page labelledBy={titleId} busy={busy} onClose={onClose}>
      {done ? (
        <div data-guarantee-done className="space-y-6 text-center">
          <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--raised)] text-[var(--ink)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg>
          </span>
          <h1 id={titleId} role="status" className="text-[22px] font-semibold leading-snug text-[var(--ink)]" dir="auto">{done}</h1>
          <button type="button" onClick={onClose} className={buttonClasses({ size: 'lg', className: 'w-full' })}>{t.moneyPages.added.done}</button>
        </div>
      ) : (
        <div data-guarantee-move={step} className="space-y-4">
          <h1 id={titleId} className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]" dir="auto">{title}</h1>
          {withAmount ? (
            <>
              <AmountHero id={amountId} label={sheet.amountLabel} value={typed} onChange={setTyped} keypad={keypad} sign={amt.sign} />
              <p className="text-center text-[14px] font-medium text-[var(--ink-secondary)]">
                {step === 'put_up' ? money.fill(g.fromBalance, { amount: wallet }) : money.fill(g.readyLine, { amount: source })}
              </p>
              <div className="flex justify-center gap-2">
                {(['quarter', 'half', 'max'] as const).map((chip) => (
                  <button key={chip} type="button" className={CHIP} disabled={source <= 0 || busy} onClick={() => amt.setFromUsdc(chipAmount(source, chip), 'down')}>{sheet[chip]}</button>
                ))}
              </div>
              {keypad ? <Keypad onKey={(key) => setTyped((v) => pressKey(v, key))} label={entry.keypad} backLabel={entry.back} /> : null}
              <p className="text-center text-[13px] font-medium text-[var(--ink-secondary)]">
                {step === 'put_up' ? fillIn(g.addNote, { days: waitDays }) : fillIn(g.withdrawNote, { date: readyOn })}
              </p>
              {step === 'take_out' && Number(data?.comingBackUsdc ?? 0) > 0 ? (
                <p data-restart className="text-center text-[13px] font-medium text-[var(--ink)]">
                  {money.fill(c.sheets.takeOut.restart, { total: Number(data?.comingBackUsdc ?? 0) + (amount ?? 0) }, { days: waitDays })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[15px] leading-relaxed text-[var(--ink-secondary)]">
              {fillIn(step === 'collect' ? c.sheets.collect.body : c.sheets.cancel.body, { days: waitDays, date: readyOn })}
            </p>
          )}
          {error ? <p role="alert" className="text-center text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
          <button type="button" disabled={blocked} aria-busy={busy} onClick={() => void confirm()} className={buttonClasses({ size: 'lg', className: 'w-full' })}>
            {busy ? c.sheets.busy : cta}
          </button>
        </div>
      )}
    </MoneyFrame>
  );
}
