'use client';

import Link from 'next/link';
import { homeDealsPreview } from '@/features/deals/dealsList';
import { useDealRows } from '@/features/deals/useDealRows';
import { OpenDealRow } from '@/features/notifications/components/OpenDealRow';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The top of the Deals list (view 44): two that need you, else the next
/// active one. A person with no live deal sees nothing here.
export function HomeDeals() {
  const messages = useTranslations();
  const t = messages.dealsPage;
  const { groups } = useDealRows();
  const preview = homeDealsPreview(groups);
  if (!preview.title) return null;
  return (
    <section data-guide="home-deals" aria-labelledby="home-deals-heading" className="pt-7">
      <div className="flex min-h-11 items-center justify-between gap-4 px-1">
        <h2 id="home-deals-heading" className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t[preview.title]}</h2>
        <Link href="/deals" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[14px] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent-on-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">{t.allDeals}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="m9 18 6-6-6-6" /></svg></Link>
      </div>
      <ul className={`mt-2 divide-y divide-[var(--lp-border-light)] rounded-[20px] border bg-[var(--lp-card)] px-4 sm:px-5 ${preview.title === 'needsYou' ? 'border-[var(--lp-accent)]' : 'border-[var(--lp-border-light)]'}`}>
        {preview.items.map((r) => <OpenDealRow key={r.key} {...r.row} yourMove={r.yourMove} />)}
      </ul>
    </section>
  );
}
