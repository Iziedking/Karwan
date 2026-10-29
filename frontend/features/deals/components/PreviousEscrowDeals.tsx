'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Pager } from '@/shared/components/Pager';
import { paged } from '@/shared/utils/paged';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatUsdc } from '@/shared/utils/format';
import { useDirectDeals } from '../hooks/useDirectDeals';
import { previousEscrowDeals } from '../previousEscrow';

/// The deals from before the new escrow, gathered so they can be reconciled.
/// Each row opens the deal page, where its actions still run on the escrow it
/// started on. Shows nothing when there are none.
export function PreviousEscrowDeals() {
  const t = useTranslations();
  const c = t.previousEscrow;
  const { address } = useAuth();
  const { deals } = useDirectDeals();
  const [at, setAt] = useState(0);
  const all = previousEscrowDeals(deals);
  if (!all.length) return null;
  const page = paged(all, at);
  const me = address?.toLowerCase();

  return (
    <section aria-labelledby="previous-escrow" className="mt-10">
      <h2 id="previous-escrow" className="text-[20px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{c.title}</h2>
      <p className="mt-1.5 max-w-[58ch] text-[15px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{c.body}</p>
      <ul className="mt-4 space-y-3">
        {page.rows.map((d) => {
          const buying = d.buyer.toLowerCase() === me;
          const stage = d.view?.stage;
          return (
            <li
              key={d.jobId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[var(--lp-dark)]">
                  {d.counterpartyName ?? `${(buying ? d.seller : d.buyer).slice(0, 6)}…`}
                </p>
                <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">
                  {buying ? c.asBuyer : c.asSeller} · <span className="tabular-nums">{formatUsdc(d.dealAmountUsdc)}</span>
                  {stage ? <> · {t.dealStage.labels[stage]}</> : null}
                </p>
              </div>
              <Link
                href={`/deals/${d.jobId}`}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              >
                {c.open}
              </Link>
            </li>
          );
        })}
      </ul>
      <Pager page={page} label={c.title} onPage={setAt} />
    </section>
  );
}
