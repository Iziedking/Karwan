'use client';
import type { DirectDeal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { protectionLines } from '../protection';

export function ProtectionSection({ deal, viewerIsBuyer }: { deal: DirectDeal; viewerIsBuyer: boolean }) {
  const copy = useTranslations().dealWorkspace.protection;
  const lines = protectionLines(deal.trust, viewerIsBuyer ? 'buyer' : 'seller', copy, deal.requireStake ? deal.requireStakePct : undefined);
  return (
    <section aria-labelledby="deal-protection" className="mt-6 border-t border-[var(--lp-border-light)] pt-5">
      <h2 id="deal-protection" className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{copy.title}</h2>
      <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-[var(--lp-dark)]">
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}
