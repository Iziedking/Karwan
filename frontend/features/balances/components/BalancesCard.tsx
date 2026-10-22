'use client';
import { useState } from 'react';
import { formatUnits } from 'viem';
import { cn } from '@/shared/utils/cn';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { CHAIN_META, ROW_KEYS, useChainBalances, type RowKey } from '../hooks/useChainBalances';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import type { Messages } from '@/shared/i18n/messages/en';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { arcIncludingPool, chainsSummaryLabel } from '../chainRows';

const CARD = 'flex h-full flex-col rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)]';

export type BalanceView = 'you' | 'buyer' | 'seller';
type View = BalanceView;

/// USDC per chain for one wallet. The total and the wallet tabs stay on screen;
/// the chains fold into one line on every tab, money or not, and open on Show.
/// The card fills its grid cell, so it lines up with whatever sits beside it.
export function BalancesCard({
  buyerAgent,
  sellerAgent,
  title,
  subtitle,
  view: viewProp,
  onViewChange,
}: {
  buyerAgent?: string;
  sellerAgent?: string;
  title?: string;
  subtitle?: string;
  /// Controlled wallet tab, when the page shows that wallet's actions beside it.
  view?: BalanceView;
  onViewChange?: (view: BalanceView) => void;
} = {}) {
  // Source of truth is the unified auth hook. covers both wagmi-connected
  // web3 users and Circle passkey/email users (their identity DCW address).
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const [ownView, setOwnView] = useState<View>('you');
  const view = viewProp ?? ownView;
  const setView = (next: View) => {
    setOwnView(next);
    onViewChange?.(next);
  };
  const [showChains, setShowChains] = useState(false);
  const bc = useTranslations().balancesCard;

  const buyer = (buyerAgent as `0x${string}` | undefined) ?? undefined;
  const seller = (sellerAgent as `0x${string}` | undefined) ?? undefined;

  // Only the tab on screen fetches. The client's 30s staleTime serves a tab
  // you just looked at from cache.
  const youBal = useChainBalances(address, view === 'you');
  const buyerBal = useChainBalances(buyer, view === 'buyer');
  const sellerBal = useChainBalances(seller, view === 'seller');
  const { pool, poolLoaded } = useMoneyBalances();

  if (!auth.isAuthenticated || !address) {
    return (
      <div className={cn(CARD, 'p-6')}>
        <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title ?? bc.title}</h2>
        <p className="mt-2 text-[14px] text-[var(--lp-text-sub)] font-medium">{bc.signedOutBody}</p>
      </div>
    );
  }

  const groups = {
    you: { address, bal: youBal },
    buyer: { address: buyer, bal: buyerBal },
    seller: { address: seller, bal: sellerBal },
  } as const;
  const active = groups[view];
  const tabs: Array<{ key: View; label: string; disabled?: boolean }> = [
    { key: 'you', label: bc.tabs.you },
    { key: 'buyer', label: bc.tabs.buyer, disabled: !buyer },
    { key: 'seller', label: bc.tabs.seller, disabled: !seller },
  ];

  const allBalances = [youBal, buyerBal, sellerBal].flatMap((g) => Object.values(g));
  const busy = allBalances.some((b) => b.isRefetching);
  const lastUpdated = Math.max(...allBalances.map((b) => b.dataUpdatedAt).filter((t) => t > 0), 0);
  function refreshAll() {
    for (const b of allBalances) b.refetch();
  }

  const rows = ROW_KEYS.map((key) => {
    const q = active.bal[key];
    const read = q.isLoading || !q.data ? null : Number(formatUnits(q.data.value, q.data.decimals));
    // Your Arc row includes the pool; it waits for the pool rather than show a smaller figure first.
    const amount = view === 'you' && key === 'arc' ? (poolLoaded ? arcIncludingPool(read, pool) : null) : read;
    return { key, amount };
  });
  const settled = rows.every((r) => r.amount !== null);
  // A chain still loading stays in the list until it is known to be empty, so
  // nothing is ever reported as zero before it has been read.
  const listed = rows.filter((r) => r.amount === null || r.amount > 0).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const empty = rows.filter((r) => r.amount === 0);
  const total = settled ? rows.reduce((sum, r) => sum + (r.amount ?? 0), 0) : null;
  const funded = rows.filter((r) => (r.amount ?? 0) > 0).length;

  const header = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold tracking-[-0.02em]">{title ?? bc.title}</span>
        <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)] font-medium">
          {subtitle ?? bc.chainCountTemplate.replace('{n}', String(rows.length))}
        </span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-[14px] text-[var(--lp-text-muted)]">{bc.total}</span>
        <span className="mono mt-0.5 block text-[24px] font-semibold leading-none tracking-[-0.03em]">
          {total === null ? '-' : <AnimatedNumber value={total} decimals={2} />}
          <span className="ms-1 text-[14px] font-medium text-[var(--lp-text-sub)]">USDC</span>
        </span>
      </span>
    </>
  );

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">{header}</div>

      {DEALS_AVAILABLE ? (
        <div className="px-5 pb-2 sm:px-6">
          <div role="tablist" className="inline-flex gap-1 rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-1">
            {tabs.map((t) => {
              const selected = view === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => !t.disabled && setView(t.key)}
                  disabled={t.disabled}
                  className={cn(
                    'min-h-11 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                    selected
                      ? 'bg-[var(--lp-control-active-bg)] text-[var(--lp-control-active-ink)]'
                      : t.disabled
                        ? 'cursor-not-allowed text-[var(--lp-text-muted)] opacity-50'
                        : 'text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]',
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!active.address ? (
        <p className="px-5 py-4 text-[14px] text-[var(--lp-text-sub)] sm:px-6 font-medium">{bc.notConfigured}</p>
      ) : (
        <ul className="px-5 sm:px-6">
          <li>
            <button
              type="button"
              onClick={() => setShowChains((v) => !v)}
              aria-expanded={showChains}
              className="flex min-h-14 w-full items-center gap-3 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="flex shrink-0 -space-x-2 rtl:space-x-reverse" aria-hidden>
                {[...listed, ...empty].slice(0, 4).map((r) => (
                  <span key={r.key} className="rounded-full ring-2 ring-[var(--lp-card)]">
                    <ChainLogo chain={CHAIN_META[r.key].key} size={22} />
                  </span>
                ))}
              </span>
              <span className="min-w-0 flex-1 text-[14px] text-[var(--lp-text-sub)] font-medium">
                {settled ? chainsSummaryLabel(funded, rows.length, bc) : '-'}
              </span>
              <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{showChains ? bc.hide : bc.reveal}</span>
            </button>
            {showChains ? (
              <ul className="border-t border-[var(--lp-border-light)]">
                {listed.map((r) => (
                  <ChainRow key={r.key} rowKey={r.key} amount={r.amount} />
                ))}
                {empty.map((r) => (
                  <ChainRow key={r.key} rowKey={r.key} amount={0} muted />
                ))}
              </ul>
            ) : null}
          </li>
        </ul>
      )}

      <div className="mt-auto flex items-center justify-end gap-3 border-t border-[var(--lp-border-light)] px-5 py-3 sm:px-6">
        {lastUpdated > 0 ? (
          <p className="text-[14px] text-[var(--lp-text-muted)]">
            {bc.updatedTemplate.replace('{time}', timeAgo(lastUpdated, bc.timeAgo))}
          </p>
        ) : null}
        <button
          type="button"
          onClick={refreshAll}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-[var(--lp-text-sub)] transition-colors hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:cursor-wait disabled:opacity-60"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className={busy ? 'animate-spin motion-reduce:animate-none' : ''}>
            <path d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {busy ? bc.refreshing : bc.refresh}
        </button>
      </div>
    </div>
  );
}

function ChainRow({ rowKey, amount, muted = false }: { rowKey: RowKey; amount: number | null; muted?: boolean }) {
  const m = CHAIN_META[rowKey];
  return (
    <li className="flex min-h-14 items-center gap-3 border-t border-[var(--lp-border-light)] py-2 first:border-t-0">
      <ChainLogo chain={m.key} size={muted ? 24 : 30} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[14px] font-semibold leading-tight', muted && 'text-[var(--lp-text-sub)]')}>{m.name}</span>
        <span className="mt-0.5 block text-[14px] text-[var(--lp-text-muted)]">{m.sub}</span>
      </span>
      <span className={cn('mono text-end font-semibold tabular-nums', muted ? 'text-[14px] text-[var(--lp-text-muted)]' : 'text-[18px] tracking-[-0.02em]')}>
        {amount === null ? '-' : <AnimatedNumber value={amount} decimals={2} />}
        <span className="ms-1 text-[14px] font-medium text-[var(--lp-text-muted)]">USDC</span>
      </span>
    </li>
  );
}


function timeAgo(ts: number, copy: Messages['balancesCard']['timeAgo']): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return copy.justNow;
  if (s < 60) return copy.secondsTemplate.replace('{n}', String(s));
  const m = Math.floor(s / 60);
  if (m < 60) return copy.minutesTemplate.replace('{n}', String(m));
  const h = Math.floor(m / 60);
  return copy.hoursTemplate.replace('{n}', String(h));
}
