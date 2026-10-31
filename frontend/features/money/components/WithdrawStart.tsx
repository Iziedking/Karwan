'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { fill } from '@/features/deals/workspace/presentation';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import { formatAmount } from '../balanceModel';
import { withdrawReady, type WithdrawDestination } from '../withdrawStart';

const PRIMARY =
  'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2';

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

  const choice = (id: WithdrawDestination, title: string, line: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={destination === id}
      onClick={() => setDestination(id)}
      className={cn(
        'flex w-full flex-col items-start rounded-[16px] border p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        destination === id ? 'border-[var(--lp-dark)] bg-[var(--lp-card)]' : 'border-[var(--lp-border-light)] bg-[var(--lp-card)]',
      )}
    >
      <span className="text-[16px] font-semibold text-[var(--lp-dark)]">{title}</span>
      <span className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">{line}</span>
    </button>
  );

  return (
    <div data-withdraw-start className="space-y-6">
      <label className="block">
        <span className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.amount}</span>
        <span className="mt-1.5 flex items-baseline gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
            placeholder="0.00"
            aria-describedby="withdraw-available"
            className="form-input block w-full text-[28px] font-semibold tabular-nums"
          />
          <span className="text-[15px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
        </span>
        <span id="withdraw-available" className={cn('mt-1.5 block text-[14px]', over ? 'font-semibold text-[var(--color-critical)]' : 'text-[var(--lp-text-sub)]')}>
          {over ? t.over : balance !== null ? fill(t.available, { amount: formatAmount(balance, locale) }) : ' '}
        </span>
      </label>
      <fieldset>
        <legend className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.whereTitle}</legend>
        <div role="radiogroup" aria-label={t.whereTitle} className="mt-2 grid gap-2 sm:grid-cols-2">
          {choice('wallet', t.toWallet, t.toWalletLine)}
          {choice('karwan', t.toKarwan, t.toKarwanLine)}
        </div>
      </fieldset>
      {destination === 'wallet' ? (
        <label className="block">
          <span className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.pasteAddress}</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            placeholder="0x"
            className="form-input mt-1.5 block w-full font-mono text-[15px]"
          />
          {badAddress ? <span role="alert" className="mt-1.5 block text-[14px] text-[var(--color-critical)]">{t.badAddress}</span> : null}
        </label>
      ) : null}
      <button type="button" disabled={!check.ok} onClick={go} className={PRIMARY}>
        {check.ok && destination === 'wallet' ? fill(t.withdrawCta, { amount: formatAmount(Number(amount), locale) }) : t.continueCta}
      </button>
    </div>
  );
}
