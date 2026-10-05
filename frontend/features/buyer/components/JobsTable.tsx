'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { BuyerJob } from '@/core/api';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { formatUsdc, relativeTime } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import { cn } from '@/shared/utils/cn';
import { requestTitle } from '@/features/search/requestTitle';

type StatusCopy = Messages['jobsTable']['status'];
type Tone = 'positive' | 'live' | 'muted';

function status(j: BuyerJob, copy: StatusCopy): { label: string; tone: Tone } {
  if (j.cancelledAt) return { label: copy.cancelled, tone: 'muted' };
  if (j.expiredAt) return { label: copy.expired, tone: 'muted' };
  if (j.escrowFunded) return { label: copy.escrowFunded, tone: 'positive' };
  if (j.finalized) return { label: copy.accepted, tone: 'live' };
  if (j.bids.length > 0) {
    const template = j.bids.length === 1 ? copy.bidOne : copy.bidOther;
    return { label: template.replace('{count}', String(j.bids.length)), tone: 'live' };
  }
  return { label: copy.open, tone: 'live' };
}

const FIRST_PAGE = 6;
const MORE = 10;

/// The buyer's own requests: what was asked, budget and due date, and where
/// each one stands. The whole row opens the request.
export function JobsTable({ jobs }: { jobs: BuyerJob[] }) {
  const { dismissed, dismiss } = useDismissed('managed-jobs');
  const jt = useTranslations().jobsTable;
  const rl = useTranslations().requestList;
  const [shown, setShown] = useState(FIRST_PAGE);
  const visible = jobs.filter((j) => !dismissed.has(j.jobId));

  if (visible.length === 0) {
    return (
      <p className="py-10 text-center text-[15px] font-medium text-[var(--lp-text-sub)]">
        {jobs.length === 0 ? jt.empty.none : jt.empty.allDismissed}
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-[var(--lp-border-light)]">
        {visible.slice(0, shown).map((j) => {
          const s = status(j, jt.status);
          const title = requestTitle(j.briefText) ?? rl.untitled;
          const ended = !!(j.cancelledAt || j.expiredAt || j.escrowFunded);
          return (
            <li key={j.jobId} className="flex items-center gap-2">
              <Link
                href={`/jobs/${j.jobId}`}
                className="group flex min-h-[72px] min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-[16px] font-semibold text-[var(--lp-dark)]">{title}</span>
                  <span className="mt-1 block truncate text-[14px] font-medium text-[var(--lp-text-sub)]">
                    {rl.upTo.replace('{amount}', formatUsdc(j.budgetUsdc, { withSuffix: false }))} · {rl.due.replace('{when}', relativeTime(j.deadlineUnix))}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-2 text-[14px] font-semibold text-[var(--lp-dark)]">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      s.tone === 'positive' ? 'bg-[var(--color-positive)]' : s.tone === 'live' ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-border-light)]',
                    )}
                  />
                  {s.label}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-[var(--lp-text-sub)] transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"><path d="m9 18 6-6-6-6" /></svg>
                </span>
              </Link>
              {ended ? (
                <button
                  type="button"
                  aria-label={j.expiredAt ? jt.dismiss.ariaExpired : j.cancelledAt ? jt.dismiss.ariaCancelled : jt.dismiss.ariaFunded}
                  onClick={() => dismiss(j.jobId)}
                  className="me-2 grid size-11 shrink-0 place-items-center rounded-full text-[18px] text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                >
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {visible.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + MORE)}
          className="flex min-h-12 w-full items-center justify-center border-t border-[var(--lp-border-light)] text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
        >
          {rl.showMore}
        </button>
      ) : null}
    </div>
  );
}
