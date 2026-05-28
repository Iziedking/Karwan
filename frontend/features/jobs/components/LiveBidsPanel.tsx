'use client';
import { useEffect, useState } from 'react';
import { api, type BuyerJob, type BuyerBid } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { ProfilePeekModal } from './ProfilePeekModal';

const REFRESH_TRIGGERS = new Set([
  'bid.submitted',
  'bid.scored',
  'counter.issued',
  'counter.response.submitted',
  'bid.accepted',
]);

export function LiveBidsPanel({ initial }: { initial: BuyerJob }) {
  const [job, setJob] = useState(initial);
  // Profile peek state: address of the seller whose card was clicked.
  // Lives on the panel (not each row) so the modal portal mounts once and
  // re-uses the same component across all rows.
  const [peekSeller, setPeekSeller] = useState<string | null>(null);
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
          The seller agent is scoring your request.
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
    <>
      <ul className="divide-y divide-[var(--color-line)]">
        {sorted.map((b, i) => {
          const isLead = topScore != null && b.score === topScore;
          return (
            <BidRow
              key={b.seller}
              bid={b}
              isLead={isLead && i === 0}
              onPeek={() => setPeekSeller(b.seller)}
            />
          );
        })}
      </ul>
      <ProfilePeekModal
        open={peekSeller != null}
        onClose={() => setPeekSeller(null)}
        address={peekSeller ?? ''}
        role="seller"
        compact
      />
    </>
  );
}

function BidRow({ bid, isLead, onPeek }: { bid: BuyerBid; isLead: boolean; onPeek: () => void }) {
  const price = formatUsdc(bid.priceUsdc, { withSuffix: false });
  const counter = bid.suggestedCounterPrice
    ? formatUsdc(bid.suggestedCounterPrice, { withSuffix: false })
    : null;
  const score = bid.score ?? null;
  const tone = score != null ? scoreTone(score) : null;
  const SEGMENTS = 10;
  const filledSegments = score != null ? Math.round((score / 100) * SEGMENTS) : 0;

  return (
    <li className="relative px-5 py-4 transition-colors hover:bg-[var(--color-surface-2)]">
      {isLead && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
          style={{ background: 'var(--color-accent)' }}
        />
      )}

      <button
        type="button"
        onClick={onPeek}
        title={`View ${shortAddress(bid.seller)}'s profile`}
        aria-label={`View profile for ${shortAddress(bid.seller)}`}
        className="w-full flex items-center justify-between gap-3 -mx-1 px-1 py-0.5 rounded-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isLead && (
            <span
              className="text-[9px] tracking-[0.16em] uppercase font-semibold"
              style={{ color: 'var(--color-accent)' }}
            >
              Lead
            </span>
          )}
          <span className="mono text-[12px] text-[var(--color-ink-dim)] truncate">
            {shortAddress(bid.seller)}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <ReputationBadge address={bid.seller} size="sm" />
          <span
            aria-hidden
            className="mono text-[10px] text-[var(--color-ink-faint)] opacity-60"
          >
            ↗
          </span>
        </span>
      </button>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="serif text-[32px] tabular-nums leading-none tracking-[-0.02em]">
            {price}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            USDC
          </span>
        </div>
        {score != null && tone && (
          <div className="flex items-baseline gap-1 mono leading-none">
            <span
              className="text-[15px] tabular-nums font-semibold"
              style={{ color: tone }}
            >
              {score}
            </span>
            <span className="text-[9px] tracking-[0.08em] text-[var(--color-ink-faint)]">
              /100
            </span>
          </div>
        )}
      </div>

      {score != null && tone && (
        <div className="mt-2.5 flex gap-[3px]" aria-hidden>
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const filled = i < filledSegments;
            return (
              <span
                key={i}
                className="flex-1 h-[3px]"
                style={{
                  background: filled ? tone : 'var(--color-line)',
                  transition: 'background-color 360ms ease',
                  transitionDelay: `${i * 28}ms`,
                }}
              />
            );
          })}
        </div>
      )}

      {(counter || bid.suggestedCounterDeadlineDays != null) && (
        <div className="mt-3 flex border-t border-[var(--color-line)]">
          {counter && (
            <KeyValue label="Counter" value={`${counter} USDC`} />
          )}
          {counter && bid.suggestedCounterDeadlineDays != null && (
            <span aria-hidden className="w-px my-2 bg-[var(--color-line)]" />
          )}
          {bid.suggestedCounterDeadlineDays != null && (
            <KeyValue
              label="ETA"
              value={`${bid.suggestedCounterDeadlineDays}d`}
            />
          )}
        </div>
      )}
    </li>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 pt-2.5 flex items-baseline justify-between gap-2 px-0.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
        {label}
      </span>
      <span className="mono text-[11px] text-[var(--color-ink)] tabular-nums">
        {value}
      </span>
    </div>
  );
}

function scoreTone(score: number): string {
  if (score >= 70) return 'var(--color-positive)';
  if (score >= 40) return 'var(--color-accent)';
  return 'var(--color-warning)';
}
