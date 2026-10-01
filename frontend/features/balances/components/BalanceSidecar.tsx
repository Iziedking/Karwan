'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatBalance, heroAmount, homeState } from '@/features/money/balanceModel';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';

/// The one balance beside a deal form, so the price is set knowing what can
/// be spent. Same number as the money page.
export function BalanceSidecar() {
  const t = useTranslations().money.home;
  const { locale } = useLocale();
  const balances = useMoneyBalances();
  const facts = { balance: balances.balance, pool: balances.pool, loading: balances.loading, error: balances.error };
  const state = homeState(facts);

  return (
    <aside aria-labelledby="sidecar-balance" className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <h2 id="sidecar-balance" className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.balanceLabel}</h2>
      {state === 'loading' ? (
        <div aria-busy="true" className="mt-2 h-8 w-32 rounded-[8px] bg-[var(--lp-light)]" />
      ) : state === 'error' ? (
        <div className="mt-2 space-y-2">
          <p role="alert" className="text-[14px] text-[var(--lp-dark)]">{t.loadError}</p>
          <button type="button" onClick={balances.refetch} className="min-h-11 text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
            {t.tryAgain}
          </button>
        </div>
      ) : (
        <p className="mt-1 flex items-baseline gap-1.5 tabular-nums">
          <span className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{formatBalance(heroAmount(facts), locale)}</span>
          <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">USDC</span>
        </p>
      )}
      {state === 'empty' ? <p className="mt-1 text-[13px] text-[var(--lp-text-sub)]">{t.empty}</p> : null}
      <Link
        href="/account"
        className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        {t.add}
      </Link>
    </aside>
  );
}
