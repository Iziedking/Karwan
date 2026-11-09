'use client';
import type { FindView } from '@/core/api';
import { buttonClasses } from '@/shared/components/Button';
import type { FindPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { LeadRow } from './BuyersFound';
import { buyersTitle, fillFind } from './foundModel';

/// A seller's find as a card in the assistant (view 72, Phase 4): the best
/// fitting buyer, unnamed, and the whole list one tap away.
export function BuyersCard({ find, t, onOpen }: { find: FindView; t: FindPeopleCopy; onOpen: () => void }) {
  const leads = find.leads ?? [];
  const n = leads.length;
  return (
    <>
      <div className="px-3.5 pb-1.5 pt-3.5">
        <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{buyersTitle(n, t)}</p>
        <p className="mt-0.5 text-[13px] text-[var(--ink-secondary)]">{t.buyersSub}</p>
      </div>
      {leads[0] ? <LeadRow lead={leads[0]} t={t} /> : null}
      <div className="px-2.5 pb-2.5 pt-1">
        <button type="button" onClick={onOpen} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>
          {n === 1 ? t.seeOne : fillFind(t.seeAll, { n })}
        </button>
      </div>
    </>
  );
}
