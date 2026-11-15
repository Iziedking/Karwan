'use client';
import type { DirectDeal } from '@/core/api';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { guaranteeTerm } from '../guaranteeAsk';

/// The deal guarantee as a term of the deal (view 82): asked until the seller
/// backs it from their savings pocket, then backed. Each side's (i) says where
/// it comes from.
export function GuaranteeTermRow({ deal, viewerIsBuyer }: { deal: DirectDeal; viewerIsBuyer: boolean }) {
  const a = useTranslations().dealGuarantee.ask;
  const mt = useMoneyText({ compact: true });
  const term = guaranteeTerm(deal);
  if (!term || deal.cancelledAt) return null;
  return (
    <div data-guarantee-term className="mt-5 flex min-h-11 items-center justify-between gap-3 border-t border-[var(--line)] pt-5 text-[15px]">
      <span className="flex items-center gap-1.5 text-[var(--ink-secondary)]">
        {a.term}
        <Hint>{viewerIsBuyer ? a.hintBuyer : a.hintSeller}</Hint>
      </span>
      <span className={`font-semibold tabular-nums ${term.backed ? 'text-[var(--ink)]' : 'text-[var(--ink-secondary)]'}`}>
        {mt.fill(term.backed ? a.backed : a.asked, { amount: term.usdc })}
      </span>
    </div>
  );
}
