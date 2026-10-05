'use client';

import Link from 'next/link';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
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
  return (
    <div className="product-surface mx-auto w-full max-w-[1040px] pb-14">
      <header className="mt-5 grid gap-4 border-b border-[var(--lp-border-light)] pb-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)] lg:items-end">
        <div>
          <div className="flex items-center"><h1 className="text-[clamp(2.7rem,6vw,5.2rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[var(--lp-dark)]">{messages.accountHome.balanceLabel}</h1><NetworkHint /></div>
        </div>
      </header>

      <BalanceSummary />

      {/* Both cards stretch to the row height, so they always line up. */}
      <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" aria-label={t.byChain}>
        <div className="min-w-0">
          <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} openByDefault title={t.byChain} subtitle={t.byChainHelp} />
        </div>

        <aside className="account-launcher" aria-label={t.actionsAria}>
          <h2 className="text-[22px] font-semibold tracking-[-0.035em] text-[var(--lp-dark)]">{t.manage}</h2>
          <nav className="mt-5 divide-y divide-[var(--lp-border-light)]">
            <AccountAction href="/bridge?direction=in" label={t.add} description={t.addHelp} icon="add" primary />
            <AccountAction href="/bridge?direction=out&intent=move" label={messages.accountHome.move} description={t.moveHelp} icon="move" />
            <AccountAction href="/send" label={t.send} description={t.sendHelp} icon="send" />
          </nav>
          {ARC_NETWORK === 'testnet' ? (
            <Link
              href="/profile/wallets"
              className="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-[16px] border border-dashed border-[var(--lp-border-light)] px-4 py-3 transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{t.faucetTitle}</span>
                <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)] font-medium">{t.faucetBody}</span>
              </span>
              <span aria-hidden className="rtl-flip shrink-0 text-[var(--lp-text-sub)]">→</span>
            </Link>
          ) : null}
          <RecoveryRow />
        </aside>
      </section>

    </div>
  );
}

function AccountAction({ href, label, description, icon, primary = false }: {
  href: string;
  label: string;
  description: string;
  icon: 'add' | 'move' | 'send';
  primary?: boolean;
}) {
  return (
    <Link href={href} className="group grid min-h-[88px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-inset">
      <span className={`grid size-10 place-items-center rounded-full ${primary ? 'bg-[var(--lp-accent)] text-[var(--accent-ink)]' : 'bg-[var(--lp-light)] text-[var(--lp-dark)]'}`} aria-hidden><ActionIcon icon={icon} /></span>
      <span><span className="block text-[15px] font-bold text-[var(--lp-dark)]">{label}</span><span className="mt-1 block text-[14px] leading-5 text-[var(--lp-text-sub)] font-medium">{description}</span></span>
      <span aria-hidden className="text-[18px] text-[var(--lp-text-muted)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--lp-accent)] rtl:-scale-x-100 rtl:group-hover:-translate-x-1">→</span>
    </Link>
  );
}

function ActionIcon({ icon }: { icon: 'add' | 'move' | 'send' }) {
  if (icon === 'add') return <span className="text-[25px] font-normal leading-none">+</span>;
  if (icon === 'move') return <span className="text-[22px] leading-none">↔</span>;
  return <span className="text-[22px] leading-none">↑</span>;
}

/// The same total as Home, and where it sits. Home shows only the total; the
/// split lives here, next to the per-chain detail.
function BalanceSummary() {
  const t = useTranslations().balanceSummary;
  const owned = useOwnedBalance();
  const money = useMoneyBalances();
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
    </section>
  );
}
