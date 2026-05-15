'use client';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  if (jobs.length === 0) {
    return (
      <div className="py-10 text-center mono text-[11px] uppercase tracking-[0.14em] text-white/45">
        No jobs yet. Post a brief and the seller agent will respond within seconds.
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
          {jobs.map((j) => {
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
                  <span className="inline-flex items-center gap-1 mono text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--lp-accent)' }}>
                    Open
                    <span
                      aria-hidden
                      className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                    >
                      →
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
