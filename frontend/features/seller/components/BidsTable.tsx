import type { SellerActiveBid } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, formatUsdc } from '@/shared/utils/format';

export function BidsTable({ bids }: { bids: SellerActiveBid[] }) {
  if (bids.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--color-ink-faint)]">
        Idle. The agent is subscribed to <span className="mono">JobPosted</span> and will respond when a matching brief lands.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] border-b border-[var(--color-line)]">
            <th className="text-left font-medium px-5 py-2.5">Job</th>
            <th className="text-left font-medium px-5 py-2.5">Buyer</th>
            <th className="text-left font-medium px-5 py-2.5">Bid</th>
            <th className="text-left font-medium px-5 py-2.5">Rounds</th>
            <th className="text-left font-medium px-5 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((b) => (
            <tr key={b.jobId} className="border-b border-[var(--color-line)] last:border-0">
              <td className="px-5 py-3 mono text-[12px]">{shortHash(b.jobId, 8, 4)}</td>
              <td className="px-5 py-3 mono text-[12px] text-[var(--color-ink-dim)]">{shortHash(b.jobBuyer, 6, 4)}</td>
              <td className="px-5 py-3 mono">{formatUsdc(b.lastBidPrice)}</td>
              <td className="px-5 py-3 mono">{b.counterRounds}</td>
              <td className="px-5 py-3">
                <span className="inline-flex items-center gap-2">
                  <StatusDot tone={b.finalized ? 'positive' : 'accent'} />
                  <Tag tone={b.finalized ? 'positive' : 'accent'}>{b.finalized ? 'Finalized' : 'Negotiating'}</Tag>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
