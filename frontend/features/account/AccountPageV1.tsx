'use client';

import Link from 'next/link';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { NetworkHint } from '@/shared/components/NetworkContext';
import { useActivation } from '@/shared/hooks/useActivation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { RecoveryRow } from '@/features/recovery/components/RecoveryRow';

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
                <span className="mt-0.5 block text-[13px] text-[var(--lp-text-sub)]">{t.faucetBody}</span>
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
      <span><span className="block text-[15px] font-bold text-[var(--lp-dark)]">{label}</span><span className="mt-1 block text-[12px] leading-5 text-[var(--lp-text-sub)]">{description}</span></span>
      <span aria-hidden className="text-[18px] text-[var(--lp-text-muted)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--lp-accent)] rtl:-scale-x-100 rtl:group-hover:-translate-x-1">→</span>
    </Link>
  );
}

function ActionIcon({ icon }: { icon: 'add' | 'move' | 'send' }) {
  if (icon === 'add') return <span className="text-[25px] font-light leading-none">+</span>;
  if (icon === 'move') return <span className="text-[22px] leading-none">↔</span>;
  return <span className="text-[22px] leading-none">↑</span>;
}
