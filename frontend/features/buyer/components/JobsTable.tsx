'use client';
import { useRouter } from 'next/navigation';
import type { BuyerJob } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';

function status(j: BuyerJob): { label: string; tone: 'positive' | 'warning' | 'accent' | 'default'; dot: 'positive' | 'accent' | 'warning' | 'default' } {
  if (j.cancelledAt) return { label: 'Cancelled', tone: 'default', dot: 'default' };
  if (j.expiredAt) return { label: 'Expired', tone: 'default', dot: 'default' };
  if (j.escrowFunded) return { label: 'Escrow funded', tone: 'positive', dot: 'positive' };
  if (j.finalized) return { label: 'Accepted', tone: 'warning', dot: 'warning' };
  if (j.bids.length > 0) return { label: `${j.bids.length} bid${j.bids.length === 1 ? '' : 's'}`, tone: 'accent', dot: 'accent' };
  return { label: 'Open', tone: 'default', dot: 'default' };
}

export function JobsTable({ jobs }: { jobs: BuyerJob[] }) {
  const router = useRouter();
  const { dismissed, dismiss } = useDismissed('managed-jobs');
  const visible = jobs.filter((j) => !dismissed.has(j.jobId));

  if (visible.length === 0) {
    return (
      <div className="py-10 text-center mono text-[11px] uppercase tracking-[0.14em] text-white/45">
        {jobs.length === 0
          ? 'No jobs yet. Post a brief and the seller agent will respond within seconds.'
          : 'All cancelled deals dismissed.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="mono text-[10px] uppercase tracking-[0.16em] text-white/45 border-b border-white/[0.08]">
            <th className="text-left font-medium px-5 py-3">Job</th>
            <th className="text-left font-medium px-5 py-3">Budget</th>
            <th className="text-left font-medium px-5 py-3">Deadline</th>
            <th className="text-left font-medium px-5 py-3">Status</th>
            <th className="text-right font-medium px-5 py-3">Open</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((j) => {
            const s = status(j);
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
                aria-label={`Open deal ${shortHash(j.jobId, 8, 4)}`}
                className="group cursor-pointer border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none transition-colors"
              >
                <td className="px-5 py-3.5 mono text-[12px] tabular-nums text-white">
                  {shortHash(j.jobId, 8, 4)}
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
                <td className="px-5 py-3.5 text-right">
                  <span className="inline-flex items-center gap-2 justify-end">
                    {(j.cancelledAt || j.expiredAt || j.escrowFunded) && (
                      <button
                        type="button"
                        title="Dismiss"
                        aria-label={
                          j.expiredAt
                            ? 'Dismiss this expired brief'
                            : j.cancelledAt
                              ? 'Dismiss this cancelled deal'
                              : 'Dismiss this funded brief'
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
                      Open
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
