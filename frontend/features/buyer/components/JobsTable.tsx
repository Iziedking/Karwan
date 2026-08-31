'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BuyerJob } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

type StatusCopy = Messages['jobsTable']['status'];

function status(j: BuyerJob, copy: StatusCopy): { label: string; tone: 'positive' | 'warning' | 'accent' | 'default'; dot: 'positive' | 'accent' | 'warning' | 'default' } {
  if (j.cancelledAt) return { label: copy.cancelled, tone: 'default', dot: 'default' };
  if (j.expiredAt) return { label: copy.expired, tone: 'default', dot: 'default' };
  if (j.escrowFunded) return { label: copy.escrowFunded, tone: 'positive', dot: 'positive' };
  if (j.finalized) return { label: copy.accepted, tone: 'warning', dot: 'warning' };
  if (j.bids.length > 0) {
    const template = j.bids.length === 1 ? copy.bidOne : copy.bidOther;
    return { label: template.replace('{count}', String(j.bids.length)), tone: 'accent', dot: 'accent' };
  }
  return { label: copy.open, tone: 'default', dot: 'default' };
}

export function JobsTable({ jobs }: { jobs: BuyerJob[] }) {
  const router = useRouter();
  const { dismissed, dismiss } = useDismissed('managed-jobs');
  const jt = useTranslations().jobsTable;
  const visible = jobs.filter((j) => !dismissed.has(j.jobId));

  if (visible.length === 0) {
    return (
      <div className="py-10 text-center mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-workspace-faint)]">
        {jobs.length === 0 ? jt.empty.none : jt.empty.allDismissed}
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-[var(--lp-workspace-border)] md:hidden">
        {visible.map((j) => {
          const s = status(j, jt.status);
          const href = `/jobs/${j.jobId}`;
          return (
            <article key={j.jobId} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono text-[10px] uppercase tracking-[0.13em] text-[var(--lp-workspace-faint)]">{jt.columns.job}</p>
                  <p className="mt-1 mono text-[12px] tabular-nums text-[var(--lp-workspace-ink)]">{shortHash(j.jobId, 8, 4)}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2">
                  <StatusDot tone={s.dot} />
                  <Tag tone={s.tone}>{s.label}</Tag>
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--lp-workspace-border)] py-3">
                <div>
                  <dt className="mono text-[9px] uppercase tracking-[0.13em] text-[var(--lp-workspace-faint)]">{jt.columns.budget}</dt>
                  <dd className="mt-1 font-sans text-[17px] font-extrabold tabular-nums text-[var(--lp-workspace-ink)]">{formatUsdc(j.budgetUsdc)}</dd>
                </div>
                <div>
                  <dt className="mono text-[9px] uppercase tracking-[0.13em] text-[var(--lp-workspace-faint)]">{jt.columns.deadline}</dt>
                  <dd className="mt-1 mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-workspace-muted)]">{relativeTime(j.deadlineUnix)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between gap-3">
                {(j.cancelledAt || j.expiredAt || j.escrowFunded) ? (
                  <button
                    type="button"
                    title={jt.dismiss.title}
                    aria-label={j.expiredAt ? jt.dismiss.ariaExpired : j.cancelledAt ? jt.dismiss.ariaCancelled : jt.dismiss.ariaFunded}
                    onClick={() => dismiss(j.jobId)}
                    className="inline-flex min-h-11 items-center px-2 mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-workspace-faint)]"
                  >
                    {jt.dismiss.title}
                  </button>
                ) : <span />}
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center gap-1.5 px-2 mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-accent)]"
                >
                  {jt.row.openCta}<span aria-hidden>â†’</span>
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-workspace-faint)] border-b border-[var(--lp-workspace-border)]">
            <th className="text-start font-medium px-5 py-3">{jt.columns.job}</th>
            <th className="text-start font-medium px-5 py-3">{jt.columns.budget}</th>
            <th className="text-start font-medium px-5 py-3">{jt.columns.deadline}</th>
            <th className="text-start font-medium px-5 py-3">{jt.columns.status}</th>
            <th className="text-end font-medium px-5 py-3">{jt.columns.open}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((j) => {
            const s = status(j, jt.status);
            const href = `/jobs/${j.jobId}`;
            const go = () => router.push(href);
            const onPrefetch = () => router.prefetch(href);
            return (
              <tr
                key={j.jobId}
                onClick={go}
                onMouseEnter={onPrefetch}
                onFocus={onPrefetch}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go();
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={jt.row.openAria.replace('{id}', shortHash(j.jobId, 8, 4))}
                className="group cursor-pointer border-b border-[var(--lp-workspace-border)] last:border-0 hover:bg-[var(--lp-workspace-soft)] focus:bg-[var(--lp-workspace-soft)] focus:outline-none transition-colors"
              >
                <td className="px-5 py-3.5 mono text-[12px] tabular-nums text-[var(--lp-workspace-ink)]">
                  <span className="inline-flex items-center gap-2">
                    <span>{shortHash(j.jobId, 8, 4)}</span>
                    {((j.tradeLane ?? 'service') === 'finance' ||
                      j.tradeType === 'goods' ||
                      j.tradeType === 'mixed') && (
                      <span
                        className="mono text-[8.5px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5"
                        style={{
                          background: 'color-mix(in oklab, var(--lp-accent) 18%, transparent)',
                          color: 'var(--lp-accent)',
                          borderRadius: 3,
                        }}
                      >
                        {j.tradeType === 'goods' || j.tradeType === 'mixed' ? 'Goods' : 'B2B'}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-5 py-3.5 font-sans font-extrabold tabular-nums text-[15px] tracking-[-0.01em] text-[var(--lp-workspace-ink)]">
                  {formatUsdc(j.budgetUsdc)}
                </td>
                <td className="px-5 py-3.5 mono text-[11px] uppercase tracking-[0.1em] text-[var(--lp-workspace-muted)]">
                  {relativeTime(j.deadlineUnix)}
                </td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-2">
                    <StatusDot tone={s.dot} />
                    <Tag tone={s.tone}>{s.label}</Tag>
                  </span>
                </td>
                <td className="px-5 py-3.5 text-end">
                  <span className="inline-flex items-center gap-2 justify-end">
                    {(j.cancelledAt || j.expiredAt || j.escrowFunded) && (
                      <button
                        type="button"
                        title={jt.dismiss.title}
                        aria-label={
                          j.expiredAt
                            ? jt.dismiss.ariaExpired
                            : j.cancelledAt
                              ? jt.dismiss.ariaCancelled
                              : jt.dismiss.ariaFunded
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(j.jobId);
                        }}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full mono text-[12px] text-[var(--lp-workspace-faint)] hover:text-[var(--lp-workspace-ink)] hover:bg-[var(--lp-workspace-soft)] transition-colors"
                      >
                        ×
                      </button>
                    )}
                    <span className="inline-flex items-center gap-1 mono text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--lp-accent)' }}>
                      {jt.row.openCta}
                      <span
                        aria-hidden
                        className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
