'use client';
import type { ReactNode } from 'react';

/// The top of a deal (rule 1): who, the reference, what it is, the amount as
/// the largest line, and where the money is. The deal page, hourly work and
/// contests share it; each passes its own pieces.
export function DealTitle({ person, reference, what, amount, moneyLine, moneyTone }: {
  person: ReactNode;
  reference?: ReactNode;
  what?: string | null;
  amount: string;
  moneyLine: string;
  moneyTone: string;
}) {
  return (
    <section aria-labelledby="deal-amount" className="pt-1">
      {person}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {what ? <p dir="auto" className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--lp-dark)]">{what}</p> : <span />}
        {reference}
      </div>
      <h1 id="deal-amount" className="mt-2 flex items-baseline gap-2 tabular-nums">
        <span className="text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[40px]">{amount}</span>
        <span className="text-[15px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
      </h1>
      <p role="status" aria-live="polite" className="mt-2 inline-flex items-center gap-2 text-[14px] font-medium text-[var(--lp-text-sub)]">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: moneyTone }} />
        {moneyLine}
      </p>
    </section>
  );
}
