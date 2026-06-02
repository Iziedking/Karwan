'use client';
import { useRouter } from 'next/navigation';
import type { SellerActiveBid } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { shortHash, formatUsdc } from '@/shared/utils/format';

export function BidsTable({ bids }: { bids: SellerActiveBid[] }) {
  const router = useRouter();
  const { dismissed, dismiss } = useDismissed('seller-bids');
  const visible = bids.filter((b) => !dismissed.has(b.jobId));

  if (visible.length === 0) {
    return (
      <div className="py-10 text-center mono text-[11px] uppercase tracking-[0.14em] text-white/45">
        {bids.length === 0
          ? 'Idle. The agent is subscribed to JobPosted and will respond when a matching request lands.'
          : 'All finalized bids dismissed.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="mono text-[10px] uppercase tracking-[0.16em] text-white/45 border-b border-white/[0.08]">
            <th className="text-start font-medium px-5 py-3">Job</th>
            <th className="text-start font-medium px-5 py-3">Buyer</th>
            <th className="text-start font-medium px-5 py-3">Bid</th>
            <th className="text-start font-medium px-5 py-3">Rounds</th>
            <th className="text-start font-medium px-5 py-3">Status</th>
            <th className="text-end font-medium px-5 py-3">Open</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((b) => {
            const href = `/jobs/${b.jobId}`;
            const go = () => router.push(href);
            const onPrefetch = () => router.prefetch(href);
            return (
              <tr
                key={b.jobId}
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
                aria-label={`Open job ${shortHash(b.jobId, 8, 4)}`}
                className="group cursor-pointer border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none transition-colors"
              >
                <td className="px-5 py-3.5 mono text-[12px] tabular-nums text-white">
                  {shortHash(b.jobId, 8, 4)}
                </td>
                <td className="px-5 py-3.5 mono text-[12px] tabular-nums text-white/55">
                  {shortHash(b.jobBuyer, 6, 4)}
                </td>
                <td className="px-5 py-3.5 font-sans font-extrabold tabular-nums text-[15px] tracking-[-0.01em] text-white">
                  {formatUsdc(b.lastBidPrice)}
                </td>
                <td className="px-5 py-3.5 mono tabular-nums text-white/65">{b.counterRounds}</td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-2">
                    <StatusDot tone={b.finalized ? 'positive' : 'accent'} />
                    <Tag tone={b.finalized ? 'positive' : 'accent'}>
                      {b.finalized ? 'Finalized' : 'Negotiating'}
                    </Tag>
                  </span>
                </td>
                <td className="px-5 py-3.5 text-end">
                  <span className="inline-flex items-center gap-2 justify-end">
                    {b.finalized && (
                      <button
                        type="button"
                        title="Dismiss"
                        aria-label="Dismiss this finalized bid"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(b.jobId);
                        }}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full mono text-[12px] text-white/45 hover:text-white hover:bg-white/[0.08] transition-colors"
                      >
                        ×
                      </button>
                    )}
                    <span
                      className="inline-flex items-center gap-1 mono text-[11px] uppercase tracking-[0.12em] font-bold"
                      style={{ color: 'var(--lp-accent)' }}
                    >
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
