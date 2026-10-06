'use client';
import Link from 'next/link';
import type { DirectDeal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { protectionLines } from '../protection';
import { cashoutOpen } from './cashoutOpen';

export function ProtectionSection({ deal, viewerIsBuyer }: { deal: DirectDeal; viewerIsBuyer: boolean }) {
  const copy = useTranslations().dealWorkspace.protection;
  const lines = protectionLines(deal.trust, viewerIsBuyer ? 'buyer' : 'seller', copy, deal.requireStake ? deal.requireStakePct : undefined);
  return (
    <section aria-labelledby="deal-protection" className="mt-6 border-t border-[var(--lp-border-light)] pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="deal-protection" className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{copy.title}</h2>
        {cashoutOpen(deal, !viewerIsBuyer) ? (
          <Link
            href={`/cashout/${deal.jobId}`}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.cashOut}
          </Link>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-[var(--lp-dark)]">
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}
