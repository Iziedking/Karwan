'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type BuyerJob, type BuyerBid } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { ProfilePeekModal } from './ProfilePeekModal';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

export function LiveBidsPanel({ initial }: { initial: BuyerJob }) {
  const lb = useTranslations().liveBidsPanel;
  /// Reads from the same `qk.job.snapshot` slot useJobSnapshot writes to,
  /// so the bid panel and the page header stay in lockstep without two
  /// separate fetches. SSE bid/counter events invalidate the prefix in
  /// QueryInvalidator; this hook just picks up the new data.
  const jobQuery = useQuery({
    queryKey: qk.job.snapshot(initial.jobId),
    queryFn: () => api.job(initial.jobId),
    initialData: initial,
    staleTime: 15_000,
  });
  const job = jobQuery.data ?? initial;
  // Profile peek state. We open by USER address (not agent), since profiles
  // are keyed by user. Falls back to agent address when the bid lacks a
  // resolved user, the peek still shows the masked address gracefully.
  const [peekSeller, setPeekSeller] = useState<string | null>(null);

  if (job.bids.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[13px] text-[var(--color-ink-dim)]">{lb.empty.title}</p>
        <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">{lb.empty.body}</p>
      </div>
    );
  }

  /// Sort to match `finalizeBidCollection` in backend/src/agents/buyer.ts.
  /// Match-band FIRST (skill-fit decides), then the bid score (price + tier
  /// + completion), then lowest price as a final tiebreak. A bid card sorted
  /// only by LLM score puts LEAD on a high-rep seller with a mediocre skill
  /// fit, while the agent ACTUALLY picks the seller with the better skill
  /// fit. Mirroring the same key keeps LEAD honest.
  const MATCH_BAND_SIZE = 25;
  const bandOf = (b: BuyerBid) =>
    b.topicalMatch != null ? Math.floor(b.topicalMatch / MATCH_BAND_SIZE) : -1;
  const sorted = [...job.bids].sort((a, b) => {
    const bandDelta = bandOf(b) - bandOf(a);
    if (bandDelta !== 0) return bandDelta;
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sa !== sb) return sb - sa;
    return Number(a.priceUsdc) - Number(b.priceUsdc);
  });
  const leadSeller = sorted[0]?.seller ?? null;

  return (
    <>
      <ul className="divide-y divide-[var(--color-line)]">
        {sorted.map((b) => {
          const isLead = b.seller === leadSeller;
          return (
            <BidRow
              key={b.seller}
              bid={b}
              isLead={isLead}
              onPeek={() => setPeekSeller(b.sellerUserAddress ?? b.seller)}
              copy={lb}
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

function BidRow({
  bid,
  isLead,
  onPeek,
  copy,
}: {
  bid: BuyerBid;
  isLead: boolean;
  onPeek: () => void;
  copy: Messages['liveBidsPanel'];
}) {
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
          className="absolute start-0 top-3 bottom-3 w-[2px] rounded-full"
          style={{ background: 'var(--color-accent)' }}
        />
      )}

      <button
        type="button"
        onClick={onPeek}
        title={copy.profileTitleTemplate.replace(
          '{name}',
          bid.sellerDisplayName ?? shortAddress(bid.seller),
        )}
        aria-label={copy.profileAriaTemplate.replace(
          '{name}',
          bid.sellerDisplayName ?? shortAddress(bid.seller),
        )}
        className="w-full flex items-center justify-between gap-3 -mx-1 px-1 py-0.5 rounded-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isLead && (
            <span
              className="text-[9px] tracking-[0.16em] uppercase font-semibold"
              style={{ color: 'var(--color-accent)' }}
            >
              {copy.leadBadge}
            </span>
          )}
          {bid.sellerDisplayName ? (
            <>
              <span className="font-sans text-[13px] font-semibold text-[var(--color-ink)] truncate">
                {bid.sellerDisplayName}
              </span>
              <span className="mono text-[11px] text-[var(--color-ink-faint)] tabular-nums">
                {shortAddress(bid.seller)}
              </span>
            </>
          ) : (
            <span className="mono text-[12px] text-[var(--color-ink-dim)] truncate">
              {shortAddress(bid.seller)}
            </span>
          )}
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
              {copy.scoreOutOf}
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

      {(counter || bid.suggestedCounterDeadlineDays != null || bid.topicalMatch != null) && (
        <div className="mt-3 flex border-t border-[var(--color-line)]">
          {bid.topicalMatch != null && (
            <>
              <KeyValue label="SKILL" value={`${bid.topicalMatch}%`} />
              {(counter || bid.suggestedCounterDeadlineDays != null) && (
                <span aria-hidden className="w-px my-2 bg-[var(--color-line)]" />
              )}
            </>
          )}
          {counter && (
            <KeyValue label={copy.counter} value={`${counter} USDC`} />
          )}
          {counter && bid.suggestedCounterDeadlineDays != null && (
            <span aria-hidden className="w-px my-2 bg-[var(--color-line)]" />
          )}
          {bid.suggestedCounterDeadlineDays != null && (
            <KeyValue
              label={copy.eta}
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
