import Link from 'next/link';
import type { BuyerJob } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';

function status(j: BuyerJob): { label: string; tone: 'positive' | 'warning' | 'accent' | 'default'; dot: 'positive' | 'accent' | 'warning' | 'default' } {
  if (j.escrowFunded) return { label: 'Escrow funded', tone: 'positive', dot: 'positive' };
  if (j.finalized) return { label: 'Accepted', tone: 'warning', dot: 'warning' };
  if (j.bids.length > 0) return { label: `${j.bids.length} bid${j.bids.length === 1 ? '' : 's'}`, tone: 'accent', dot: 'accent' };
  return { label: 'Open', tone: 'default', dot: 'default' };
}

export function JobsTable({ jobs }: { jobs: BuyerJob[] }) {
  if (jobs.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--color-ink-faint)]">
        No jobs yet. Post a brief and the seller agent will respond within seconds.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] border-b border-[var(--color-line)]">
            <th className="text-left font-medium px-5 py-2.5">Job</th>
            <th className="text-left font-medium px-5 py-2.5">Budget</th>
            <th className="text-left font-medium px-5 py-2.5">Deadline</th>
            <th className="text-left font-medium px-5 py-2.5">Status</th>
            <th className="text-right font-medium px-5 py-2.5">Open</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const s = status(j);
            return (
              <tr
                key={j.jobId}
                className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors"
              >
                <td className="px-5 py-3 mono text-[12px] text-[var(--color-ink)]">{shortHash(j.jobId, 8, 4)}</td>
                <td className="px-5 py-3 mono">{formatUsdc(j.budgetUsdc)}</td>
                <td className="px-5 py-3 mono text-[12px] text-[var(--color-ink-dim)]">
                  {relativeTime(j.deadlineUnix)}
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <StatusDot tone={s.dot} />
                    <Tag tone={s.tone}>{s.label}</Tag>
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/jobs/${j.jobId}`}
                    className="text-[12px] text-[var(--color-accent)] hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
