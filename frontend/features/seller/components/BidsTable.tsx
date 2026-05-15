import type { SellerActiveBid } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, formatUsdc } from '@/shared/utils/format';

export function BidsTable({ bids }: { bids: SellerActiveBid[] }) {
  if (bids.length === 0) {
    return (
      <div className="py-10 text-center mono text-[11px] uppercase tracking-[0.14em] text-white/45">
        Idle. The agent is subscribed to <span className="mono normal-case">JobPosted</span> and will respond when a matching brief lands.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="mono text-[10px] uppercase tracking-[0.16em] text-white/45 border-b border-white/[0.08]">
            <th className="text-left font-medium px-5 py-3">Job</th>
            <th className="text-left font-medium px-5 py-3">Buyer</th>
            <th className="text-left font-medium px-5 py-3">Bid</th>
            <th className="text-left font-medium px-5 py-3">Rounds</th>
            <th className="text-left font-medium px-5 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((b) => (
            <tr
              key={b.jobId}
              className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] transition-colors"
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
