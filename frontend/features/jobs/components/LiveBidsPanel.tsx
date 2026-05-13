'use client';
import { useEffect, useState } from 'react';
import { api, type BuyerJob } from '@/core/api';
import { Tag } from '@/shared/components/Tag';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import { shortAddress, formatUsdc } from '@/shared/utils/format';

const REFRESH_TRIGGERS = new Set([
  'bid.submitted',
  'bid.scored',
  'counter.issued',
  'counter.response.submitted',
  'bid.accepted',
]);

export function LiveBidsPanel({ initial }: { initial: BuyerJob }) {
  const [job, setJob] = useState(initial);
  const events = useLiveEvents(initial.jobId, 50);

  useEffect(() => {
    const latest = events[0];
    if (!latest || !REFRESH_TRIGGERS.has(latest.type)) return;
    const t = setTimeout(() => {
      api.job(initial.jobId).then(setJob).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [events, initial.jobId]);

  if (job.bids.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-[var(--color-ink-faint)]">No bids yet.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--color-line)]">
      {job.bids.map((b) => (
        <li key={b.seller} className="px-5 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="mono text-[12px] text-[var(--color-ink-dim)]">{shortAddress(b.seller)}</span>
            {b.score !== null && <Tag tone="accent">score {b.score}</Tag>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] mono text-[var(--color-ink)]">
            <span>bid {formatUsdc(b.priceUsdc, { withSuffix: false })}</span>
            {b.suggestedCounterPrice && (
              <span>counter {formatUsdc(b.suggestedCounterPrice, { withSuffix: false })}</span>
            )}
            {b.suggestedCounterDeadlineDays && <span>{b.suggestedCounterDeadlineDays}d</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
