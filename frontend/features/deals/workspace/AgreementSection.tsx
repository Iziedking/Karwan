'use client';
import { useState } from 'react';
import type { DirectDeal } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill, formatDealDate, formatUsdcAmount } from './presentation';
import { agreementBlocks, type AgreementBlock, type AgreementPart } from './agreementBlocks';

const MICROS = 1_000_000n;

function feeUsdc(deal: DirectDeal): string | null {
  const wei = deal.onChain?.feeTotalWei;
  if (!wei) return null;
  const micros = BigInt(wei);
  const fraction = (micros % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${micros / MICROS}.${fraction}` : `${micros / MICROS}`;
}

export function AgreementSection({ deal, bare = false }: { deal: DirectDeal; bare?: boolean }) {
  const copy = useTranslations().dealWorkspace;
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const payments = deal.onChain?.milestonePcts?.length
    ?? deal.milestonePcts?.length
    ?? (deal.firstReleasePct >= 100 ? 1 : 2);
  const fee = feeUsdc(deal);
  return (
    <section aria-labelledby={bare ? undefined : 'deal-agreement'} className="space-y-3">
      {bare ? null : <h2 id="deal-agreement" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.agreement.title}</h2>}
      <AgreementText terms={deal.terms} />
      <p className="text-[14px] tabular-nums text-[var(--lp-text-sub)] font-medium">
        {[
          payments === 1 ? copy.agreement.paymentsOne : fill(copy.agreement.paymentsTemplate, { n: payments }),
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

/// The signed text laid out to be read: each "Label: text" line as a labelled
/// fact, milestones as their own rows. The words are exactly what was signed.
function AgreementText({ terms }: { terms: string }) {
  const blocks = agreementBlocks(terms);
  return (
    <div className="max-w-[62ch] divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
      {blocks.map((block, i) => (
        <AgreementBlockView key={i} block={block} />
      ))}
    </div>
  );
}

function AgreementBlockView({ block }: { block: AgreementBlock }) {
  if (block.kind === 'text') {
    return <p dir="auto" className="py-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">{block.body}</p>;
  }
  if (block.kind === 'list') {
    return <div className="py-3"><Parts parts={block.parts} /></div>;
  }
  return (
    <div className="py-3">
      <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{block.label}</p>
      {block.body ? <p dir="auto" className="mt-0.5 text-[15px] leading-relaxed text-[var(--lp-dark)]">{block.body}</p> : null}
      {block.parts ? <Parts parts={block.parts} /> : null}
    </div>
  );
}

function Parts({ parts }: { parts: AgreementPart[] }) {
  return (
    <ol className="mt-3 space-y-3">
      {parts.map((part, i) => (
        <li key={i} className="border-s-2 border-[var(--lp-border-light)] ps-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[15px] font-semibold text-[var(--lp-dark)]">{part.title}</span>
            {part.detail ? <span className="text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">{part.detail}</span> : null}
          </p>
          {part.body ? <p dir="auto" className="mt-0.5 text-[15px] leading-relaxed text-[var(--lp-dark)]">{part.body}</p> : null}
        </li>
      ))}
    </ol>
  );
}
