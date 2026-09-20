'use client';
import { useState } from 'react';
import type { DirectDeal } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill, formatDealDate, formatUsdcAmount } from './presentation';

const MICROS = 1_000_000n;

function feeUsdc(deal: DirectDeal): string | null {
  const wei = deal.onChain?.feeTotalWei;
  if (!wei) return null;
  const micros = BigInt(wei);
  const fraction = (micros % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${micros / MICROS}.${fraction}` : `${micros / MICROS}`;
}

export function AgreementSection({ deal }: { deal: DirectDeal }) {
  const copy = useTranslations().dealWorkspace;
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const payments = deal.onChain?.milestonePcts?.length ?? 2;
  const fee = feeUsdc(deal);
  return (
    <section aria-labelledby="deal-agreement" className="space-y-3">
      <h2 id="deal-agreement" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.agreement.title}</h2>
      <p className="max-w-[62ch] whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--lp-dark)]">{deal.terms}</p>
      <p className="text-[14px] tabular-nums text-[var(--lp-text-sub)]">
        {[
          fill(copy.agreement.paymentsTemplate, { n: payments }),
          deal.deadlineUnix ? fill(copy.agreement.deliverByTemplate, { date: formatDealDate(deal.deadlineUnix * 1000, locale) }) : null,
          fee ? fill(copy.agreement.feeTemplate, { amount: formatUsdcAmount(fee, locale) }) : null,
        ].filter(Boolean).join(' · ')}
      </p>
      <button
        type="button" aria-expanded={open} aria-controls="deal-wrong" onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      >
        {copy.agreement.wrongLink} <span aria-hidden className="rtl:rotate-180">›</span>
      </button>
      {open ? (
        <div id="deal-wrong" className="space-y-2 border-s-2 border-[var(--lp-border-light)] ps-4 text-[14px] leading-relaxed text-[var(--lp-dark)]">
          <p>{copy.wrong.dispute}</p>
          <p>{copy.wrong.deadline}</p>
          <p>{copy.wrong.silence}</p>
          {deal.evidenceRequired ? <p>{copy.wrong.check}</p> : null}
          <p className="pt-2 font-semibold">{copy.wrong.notCoveredTitle}</p>
          <p>{copy.wrong.notCoveredReleased}</p>
          <p>{copy.wrong.notCoveredOutside}</p>
        </div>
      ) : null}
    </section>
  );
}
