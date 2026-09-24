'use client';
import Link from 'next/link';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { AccountGate } from '@/shared/components/AccountGate';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/** Three distinct ways to start a business trade, within the workspace rail. */
export default function B2BHubPage() {
  const bt = useTranslations().businessTradeDesk;
  const actions = [
    { href: '/partners', title: bt.findSupply, description: bt.findSupplySub, primary: false },
    { href: '/supply', title: bt.postOffer, description: bt.postOfferSub, primary: true },
    { href: '/buyer?mode=direct', title: bt.bringDeal, description: bt.bringDealSub, primary: false },
  ];

  return (
    <AuthGuard gateTag={bt.eyebrow} gateBody={bt.description}>
      <AccountGate kind="business">
        <div className="product-surface mx-auto w-full max-w-[1100px] pb-12 sm:pb-16">
          <header className="border-b border-[var(--lp-border-light)] py-8 sm:py-12">
            <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{bt.eyebrow}</p>
            <h1 className="mt-4 max-w-[17ch] text-[clamp(2.6rem,5vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[var(--lp-dark)]">
              {bt.title}
            </h1>
            <p className="mt-6 max-w-[58ch] text-[16px] leading-[1.6] text-[var(--lp-text-sub)] sm:text-[18px]">
              {bt.description}
            </p>
          </header>

          <nav aria-label={bt.eyebrow} className="mt-4 divide-y divide-[var(--lp-border-light)] border-b border-[var(--lp-border-light)]">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex min-h-[112px] items-center justify-between gap-5 py-6 text-start transition-colors hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block text-[clamp(1.4rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.035em] text-[var(--lp-dark)]">
                    {action.title}
                  </span>
                  <span className="mt-1.5 block max-w-[55ch] text-[15px] leading-6 text-[var(--lp-text-sub)]">
                    {action.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`grid size-11 shrink-0 place-items-center rounded-full border text-[20px] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 ${action.primary ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)] text-[var(--accent-ink)]' : 'border-[var(--lp-border-light)] text-[var(--lp-dark)]'}`}
                >
                  <span className="rtl-flip">→</span>
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </AccountGate>
    </AuthGuard>
  );
}
