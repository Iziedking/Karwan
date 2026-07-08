'use client';
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
      <div className="py-10 text-center mono text-[11px] uppercase tracking-[0.14em] text-white/45">
        {jobs.length === 0 ? jt.empty.none : jt.empty.allDismissed}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="mono text-[10px] uppercase tracking-[0.16em] text-white/45 border-b border-white/[0.08]">
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
                className="group cursor-pointer border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none transition-colors"
              >
                <td className="px-5 py-3.5 mono text-[12px] tabular-nums text-white">
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
                <td className="px-5 py-3.5 font-sans font-extrabold tabular-nums text-[15px] tracking-[-0.01em] text-white">
                  {formatUsdc(j.budgetUsdc)}
                </td>
                <td className="px-5 py-3.5 mono text-[11px] uppercase tracking-[0.1em] text-white/55">
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
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full mono text-[12px] text-white/45 hover:text-white hover:bg-white/[0.08] transition-colors"
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
  );
}
