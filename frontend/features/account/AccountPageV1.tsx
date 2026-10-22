'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { ProductBackLink } from '@/shared/components/ProductBackLink';
import { useAuth } from '@/shared/hooks/useAuth';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { BalancesCard, type BalanceView } from '@/features/balances/components/BalancesCard';
import { WalletPanel } from './WalletPanel';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { NetworkHint } from '@/shared/components/NetworkContext';
import { useActivation } from '@/shared/hooks/useActivation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { RecoveryRow } from '@/features/recovery/components/RecoveryRow';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';

export function AccountPageV1() {
  const t = useTranslations().profile.signInGate;
  return <AuthGuard gateTag={t.tag} gateBody={t.body}><AccountPageInner /></AuthGuard>;
}

function AccountPageInner() {
  const { agents } = useActivation();
  const messages = useTranslations();
  const t = messages.account.page;
  const [view, setView] = useState<BalanceView>('you');
  return (
    <div className="product-surface mx-auto w-full max-w-[1040px] pb-14">
      <OwnBack />
      <header className="mt-2">
        <div>
          <div className="flex items-center"><h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{messages.accountHome.balanceLabel}</h1><NetworkHint /></div>
        </div>
      </header>

      <BalanceSummary />

      {/* Both cards stretch to the row height, so they always line up. The
          panel follows the wallet selected in the card beside it. */}
      <section className="mt-7 grid gap-5 lg:grid-cols-2" aria-label={t.byChain}>
        <div className="min-w-0">
          <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} title={t.byChain} subtitle={t.byChainHelp} view={view} onViewChange={setView} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label={t.actionsAria}>
          <WalletPanel tab={view} />
          {view === 'you' && ARC_NETWORK === 'testnet' ? (
            <Link
              href="/profile/wallets"
              className="flex min-h-11 items-center justify-between gap-3 rounded-[16px] border border-dashed border-[var(--lp-border-light)] px-4 py-3 transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{t.faucetTitle}</span>
                <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)] font-medium">{t.faucetBody}</span>
              </span>
            </Link>
          ) : null}
          <RecoveryRow />
        </aside>
      </section>

    </div>
  );
}

/// Back on the content column, level with the title it leaves.
function OwnBack() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  return (
    <div data-own-back className="-ms-2 empty:hidden">
      <ProductBackLink pathname={pathname} isAuthenticated={isAuthenticated} />
    </div>
  );
}

/// The same total as Home, and where it sits. Home shows only the total; the
/// split lives here, next to the per-chain detail.
function BalanceSummary() {
  const t = useTranslations().balanceSummary;
  const owned = useOwnedBalance();
  const money = useMoneyBalances();
  const { address } = useAuth();
  // The stake the assistant names, read from the same server figure.
  const staked = useQuery({
    queryKey: ['money', 'balance', address?.toLowerCase()],
    queryFn: () => api.moneyBalance().then((r) => r.balance.staked),
    enabled: !!address,
    staleTime: 30_000,
  }).data ?? 0;
  const fmt = (n: number | null | undefined) =>
    n == null ? '-' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows: Array<{ label: string; value: number | null; sub?: Array<{ label: string; value: number | null }> }> = [
    { label: t.onArc, value: owned.total == null ? null : owned.wallet },
    { label: t.otherChains, value: owned.total == null ? null : owned.otherChains },
    {
      label: t.agents,
      value: owned.total == null ? null : owned.agents,
      sub: [
        { label: t.forBuying, value: money.buyer },
        { label: t.forSelling, value: money.seller },
      ],
    },
  ];
  return (
    <section aria-label={t.total} className="mt-7 rounded-[22px] bg-[var(--lp-card)] p-5 sm:p-6">
      <p className="text-[15px] font-semibold text-[var(--lp-text-sub)]">{t.total}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[var(--lp-dark)]">{fmt(owned.total)}</span>
        <span className="text-[17px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
      </p>
      <dl className="mt-5 divide-y divide-[var(--lp-border-light)] border-t border-[var(--lp-border-light)]">
        {rows.map((row) => (
          <div key={row.label} className="py-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[16px] font-medium text-[var(--lp-dark)]">{row.label}</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-[var(--lp-dark)]">{fmt(row.value)} USDC</dd>
            </div>
            {row.sub ? (
              <div className="mt-1.5 space-y-1 ps-4">
                {row.sub.map((s) => (
                  <div key={s.label} className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{s.label}</span>
                    <span className="text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">{fmt(s.value)} USDC</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </dl>
      {staked > 0 ? (
        <div className="mt-2 border-t border-[var(--lp-border-light)] pt-3">
          <div className="flex items-baseline justify-between gap-4">
            <Link href="/stake" className="text-[16px] font-medium text-[var(--lp-dark)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">{t.staked}</Link>
            <span className="text-[16px] font-semibold tabular-nums text-[var(--lp-dark)]">{fmt(staked)} USDC</span>
          </div>
          <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.stakedNote}</p>
        </div>
      ) : null}
    </section>
  );
}
