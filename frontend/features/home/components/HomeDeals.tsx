'use client';

import Link from 'next/link';
import { homeDealsPreview } from '@/features/deals/dealsList';
import { useDealRows } from '@/features/deals/useDealRows';
import { OpenDealRow } from '@/features/notifications/components/OpenDealRow';
import { CARD_CLASS } from '@/shared/components/Card';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Home's part of the Deals list (view 48): the deal that needs you as a card
/// with its move, then what is on the way. Nothing when no deal is live.
export function HomeDeals() {
  const messages = useTranslations();
  const t = messages.dealsPage;
  const { groups } = useDealRows();
  const preview = homeDealsPreview(groups);
  if (preview.empty) return null;
  return (
    <div data-guide="home-deals" className="space-y-8 pt-8">
      {preview.needsYou ? (
        <section aria-labelledby="home-needs-heading">
          <Heading id="home-needs-heading" title={t.needsYou} count={preview.needsYouCount} allLabel={preview.onTheWay.length ? undefined : t.allDeals} />
          <ul>
            <OpenDealRow {...preview.needsYou.row} yourMove variant={preview.needsYou.row.move ? 'feature' : 'card'} />
          </ul>
        </section>
      ) : null}
      {preview.onTheWay.length ? (
        <section aria-labelledby="home-deals-heading">
          <Heading id="home-deals-heading" title={t.active} count={groups.active.length} allLabel={t.allDeals} />
          <ul className={`${CARD_CLASS} divide-y divide-[var(--line)] px-5 lg:px-6`}>
            {preview.onTheWay.map((r) => <OpenDealRow key={r.key} {...r.row} yourMove={false} variant="row" />)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Heading({ id, title, count, allLabel }: { id: string; title: string; count: number; allLabel?: string }) {
  return (
    <div className="mb-3 flex min-h-11 items-center justify-between gap-4">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
      {allLabel ? (
        <Link href="/deals" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
          <span className="tabular-nums text-[var(--ink-muted)]">{count}</span>
          {allLabel}
        </Link>
      ) : (
        <span className="text-[13px] tabular-nums text-[var(--ink-muted)]">{count}</span>
      )}
    </div>
  );
}
