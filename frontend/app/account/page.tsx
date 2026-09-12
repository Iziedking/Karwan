'use client';

import Link from 'next/link';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useActivation } from '@/shared/hooks/useActivation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function AccountPage() {
  const t = useTranslations().profile.signInGate;
  return <AuthGuard gateTag={t.tag} gateBody={t.body}><AccountPageInner /></AuthGuard>;
}

function AccountPageInner() {
  const { agents } = useActivation();
  return (
    <div className="product-surface mx-auto w-full max-w-[1180px] pb-14">
      <header className="mt-5 grid gap-4 border-b border-[var(--lp-border-light)] pb-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)] lg:items-end">
        <div>
          <h1 className="text-[clamp(2.7rem,6vw,5.2rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[var(--lp-dark)]">USDC balance</h1>
        </div>
        <p className="max-w-[46ch] text-[15px] leading-6 text-[var(--lp-text-sub)] lg:pb-1">See where your USDC is held. Add, move or send it from here.</p>
      </header>

      <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]" aria-labelledby="account-holdings-heading">
        <div className="min-w-0">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="account-holdings-heading" className="text-[23px] font-semibold tracking-[-0.035em] text-[var(--lp-dark)]">By chain</h2>
              <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">Your available USDC across supported chains.</p>
            </div>
            <span className="hidden items-center gap-2 text-[12px] font-semibold text-[var(--lp-text-muted)] sm:inline-flex"><span data-live="true" className="size-2 rounded-full bg-[var(--lp-accent)]" />Live balances</span>
          </div>
          <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} openByDefault />
        </div>

        <aside className="account-launcher lg:mt-[58px]" aria-label="USDC actions">
          <h2 className="text-[22px] font-semibold tracking-[-0.035em] text-[var(--lp-dark)]">Manage USDC</h2>
          <nav className="mt-5 divide-y divide-[var(--lp-border-light)]">
            <AccountAction href="/bridge?direction=in" label="Add USDC" description="Deposit from a supported wallet." icon="add" primary />
            <AccountAction href="/bridge?direction=out&intent=move" label="Move between chains" description="Move USDC to another supported chain." icon="move" />
            <AccountAction href="/bridge?direction=out&intent=send" label="Send USDC" description="Send to a supported wallet address." icon="send" />
          </nav>
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
      <span aria-hidden className="text-[18px] text-[var(--lp-text-muted)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--lp-accent)]">→</span>
    </Link>
  );
}

function ActionIcon({ icon }: { icon: 'add' | 'move' | 'send' }) {
  if (icon === 'add') return <span className="text-[25px] font-light leading-none">+</span>;
  if (icon === 'move') return <span className="text-[22px] leading-none">↔</span>;
  return <span className="text-[22px] leading-none">↑</span>;
}
