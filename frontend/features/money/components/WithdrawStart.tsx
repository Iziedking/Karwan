'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { fill } from '@/features/deals/workspace/presentation';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import { formatAmount } from '../balanceModel';
import { withdrawReady, type WithdrawDestination } from '../withdrawStart';

/// Withdraw, first screen (view 44, P8): how much, and where it goes. A wallet
/// or exchange carries the amount and address into the existing out rail;
/// someone on Karwan opens Send with the amount.
export function WithdrawStart({ onWallet }: { onWallet: (amount: number, address: string) => void }) {
  const t = useTranslations().moneyPage;
  const { locale } = useLocale();
  const router = useRouter();
  const { balance } = useMoneyBalances();
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState<WithdrawDestination | null>(null);
  const [address, setAddress] = useState('');
  const check = withdrawReady({ amount, available: balance, destination, address });
  const over = !check.ok && check.reason === 'over';
  const badAddress = destination === 'wallet' && address.trim().length > 0 && !check.ok && check.reason === 'address';

  function go() {
    if (!check.ok) return;
    if (destination === 'karwan') router.push(`/send?amount=${encodeURIComponent(amount.trim())}`);
    else onWallet(Number(amount.trim()), address.trim());
  }

  // One card of choices (Figma, Batch 9 · Withdraw): a ring for the pick, no sublines.
  const choice = (id: WithdrawDestination, title: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={destination === id}
      onClick={() => setDestination(id)}
      className="flex min-h-[52px] w-full items-center gap-3 py-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
    >
      <span
        aria-hidden
        className={cn('size-5 shrink-0 rounded-full border', destination === id ? 'border-[6px] border-[var(--ink)]' : 'border-[1.5px] border-[var(--line-strong)]')}
      />
      <span className="text-[15px] font-medium text-[var(--ink)]">{title}</span>
    </button>
  );

  // A route that is not open yet is listed so people know it is coming, and can never be picked.
  const soon = (title: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={false}
      aria-disabled
      disabled
      className="flex min-h-[52px] w-full cursor-not-allowed items-center gap-3 py-3.5 text-start"
    >
      <span aria-hidden className="size-5 shrink-0 rounded-full border-[1.5px] border-[var(--line)]" />
      <span className="flex-1 text-[15px] font-medium text-[var(--ink-muted)]">{title}</span>
      <span className="text-[14px] text-[var(--ink-muted)]">{t.comingSoon}</span>
    </button>
  );

  return (
    <div data-withdraw-start className="space-y-6">
      <label className="block">
        <span className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.amount}</span>
        <span className="mt-1.5 flex items-baseline gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
            placeholder="0.00"
            aria-describedby="withdraw-available"
            className="amount-input block w-full min-w-0 bg-transparent text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
          />
          <span className="text-[19px] font-semibold text-[var(--ink-secondary)]">USDC</span>
        </span>
        <span id="withdraw-available" className={cn('mt-1.5 block text-[14px]', over ? 'font-semibold text-[var(--color-critical)]' : 'text-[var(--ink-secondary)]')}>
          {over ? t.over : balance !== null ? fill(t.available, { amount: formatAmount(balance, locale) }) : ' '}
        </span>
      </label>
      <fieldset>
        <legend className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.whereTitle}</legend>
        <div role="radiogroup" aria-label={t.whereTitle} className={`${CARD_CLASS} mt-2 divide-y divide-[var(--line)] px-5`}>
          {choice('wallet', t.toWallet)}
          {choice('karwan', t.toKarwan)}
          {soon(t.toBank)}
          {soon(t.toCard)}
        </div>
      </fieldset>
      {destination === 'wallet' ? (
        <label className="block">
          <span className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.pasteAddress}</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            placeholder="0x"
            className="form-input mt-2 block w-full font-mono text-[15px]"
          />
          {badAddress ? <span role="alert" className="mt-1.5 block text-[14px] text-[var(--color-critical)]">{t.badAddress}</span> : null}
        </label>
      ) : null}
      <Button type="button" size="lg" disabled={!check.ok} onClick={go} className="w-full">
        {check.ok && destination === 'wallet' ? fill(t.withdrawCta, { amount: formatAmount(Number(amount), locale) }) : t.continueCta}
      </Button>
    </div>
  );
}
