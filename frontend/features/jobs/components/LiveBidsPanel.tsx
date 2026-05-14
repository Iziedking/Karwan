'use client';
import { useEffect, useState } from 'react';
import { api, type BuyerJob, type BuyerBid } from '@/core/api';
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
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[13px] text-[var(--color-ink-dim)]">No bids yet.</p>
        <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">
          The seller agent is scoring your brief.
        </p>
      </div>
    );
  }

  // Sort: highest score first, then lowest price.
  const sorted = [...job.bids].sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sa !== sb) return sb - sa;
    return Number(a.priceUsdc) - Number(b.priceUsdc);
  });
  const topScore = sorted[0]?.score ?? null;

  return (
    <ul className="divide-y divide-[var(--color-line)]">
      {sorted.map((b, i) => {
        const isLead = topScore != null && b.score === topScore;
        return <BidRow key={b.seller} bid={b} isLead={isLead && i === 0} />;
      })}
    </ul>
  );
}

function BidRow({ bid, isLead }: { bid: BuyerBid; isLead: boolean }) {
  const price = formatUsdc(bid.priceUsdc, { withSuffix: false });
  const counter = bid.suggestedCounterPrice
    ? formatUsdc(bid.suggestedCounterPrice, { withSuffix: false })
    : null;

  return (
    <li className="relative px-5 py-4 hover:bg-[var(--color-surface-2)] transition-colors">
      {isLead && (
        <span className="absolute top-3 right-5 text-[9px] tracking-[0.08em] uppercase text-[var(--color-accent)] font-semibold">
          Lead bid
        </span>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <span className="mono text-[12px] text-[var(--color-ink-dim)]">
          {shortAddress(bid.seller)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[22px] mono font-semibold tabular-nums leading-none">{price}</span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
          USDC
        </span>
      </div>
      {bid.score != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            <span>Match score</span>
            <span className="mono text-[11px] text-[var(--color-ink)] normal-case tracking-normal">
              {bid.score}/100
            </span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-[var(--color-line)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, bid.score))}%`,
                background:
                  bid.score >= 70
                    ? 'var(--color-positive)'
                    : bid.score >= 40
                    ? 'var(--color-accent)'
                    : 'var(--color-warning)',
                transition: 'width 500ms cubic-bezier(0.4, 0.0, 0.2, 1)',
              }}
            />
          </div>
        </div>
      )}
      {(counter || bid.suggestedCounterDeadlineDays) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          {counter && (
            <Inline label="Counter" value={`${counter} USDC`} />
          )}
          {bid.suggestedCounterDeadlineDays != null && (
            <Inline label="Counter ETA" value={`${bid.suggestedCounterDeadlineDays}d`} />
          )}
        </div>
      )}
    </li>
  );
}

function Inline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-2 py-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)]">
      <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">{label}</span>
      <span className="mono text-[11px] text-[var(--color-ink)]">{value}</span>
    </div>
  );
}
