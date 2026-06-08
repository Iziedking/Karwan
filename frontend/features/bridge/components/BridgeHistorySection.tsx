'use client';
import { useMemo, useState } from 'react';
import { useBridges, type BridgePhase, type BridgeRecord } from '../hooks/useBridge';
import { BridgeRow } from './BridgeCard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const STUCK_AFTER_MS = 30 * 60 * 1000;

export type HistoryFilter = 'all' | 'pending' | 'successful' | 'failed';

/// Shared classification helpers. Two consumers read this — the chip row
/// (renders counts per bucket) and the list (filters by the active bucket).
/// `stuck` bridges count as failed so the user always has a clear retry /
/// dismiss path; everything still in motion that's NOT stuck is pending.
function isStuck(b: BridgeRecord): boolean {
  return (
    (b.phase === 'attesting' || b.phase === 'minting') &&
    Date.now() - b.startedAt > STUCK_AFTER_MS
  );
}

function bucketOf(b: BridgeRecord, isActiveFn: (p: BridgePhase) => boolean): HistoryFilter {
  if (b.phase === 'done') return 'successful';
  if (b.phase === 'error' || isStuck(b)) return 'failed';
  if (isActiveFn(b.phase)) return 'pending';
  return 'all';
}

/// Shared hook for the chip row and the list. Filter state is owned by the
/// page so both pieces stay in sync; pass the active filter in. The hook
/// returns the sorted+filtered bridges plus per-bucket counts so the row
/// can show "Successful 4 / Pending 1" without rebuilding the count itself.
export function useBridgeHistory(filter: HistoryFilter) {
  const { bridges, retry, recheck, dismiss, isActive } = useBridges();

  const counts = useMemo(() => {
    let pending = 0;
    let successful = 0;
    let failed = 0;
    for (const b of bridges) {
      const bucket = bucketOf(b, isActive);
      if (bucket === 'successful') successful += 1;
      else if (bucket === 'failed') failed += 1;
      else if (bucket === 'pending') pending += 1;
    }
    return { all: bridges.length, pending, successful, failed };
  }, [bridges, isActive]);

  const filtered = useMemo(() => {
    const sorted = [...bridges].sort((a, b) => b.startedAt - a.startedAt);
    if (filter === 'all') return sorted;
    return sorted.filter((b) => bucketOf(b, isActive) === filter);
  }, [bridges, filter, isActive]);

  return { bridges, filtered, counts, retry, recheck, dismiss };
}

/// Filter chip row. Designed to dock alongside the direction toggle on the
/// bridge page so the user controls "what bridges am I looking at" from a
/// single row, not from a separate header further down the page.
export function BridgeHistoryFilters({
  filter,
  onFilterChange,
  counts,
}: {
  filter: HistoryFilter;
  onFilterChange: (next: HistoryFilter) => void;
  counts: { all: number; pending: number; successful: number; failed: number };
}) {
  return (
    <div
      className="inline-flex p-1 gap-1 flex-wrap"
      style={{
        background: 'var(--lp-light)',
        border: '1px solid var(--lp-border-light)',
        borderRadius: 999,
      }}
    >
      <FilterChip label="All" count={counts.all} active={filter === 'all'} onClick={() => onFilterChange('all')} />
      <FilterChip label="Pending" count={counts.pending} active={filter === 'pending'} onClick={() => onFilterChange('pending')} />
      <FilterChip label="Successful" count={counts.successful} active={filter === 'successful'} onClick={() => onFilterChange('successful')} />
      <FilterChip label="Failed" count={counts.failed} active={filter === 'failed'} onClick={() => onFilterChange('failed')} />
    </div>
  );
}

/// History list. Renders the filtered bridges using BridgeRow with the
/// existing retry/recheck/dismiss handlers. Empty + no-match states stay
/// tiny so the page doesn't grow until there's real content.
export function BridgeHistoryList({ filter }: { filter: HistoryFilter }) {
  const { bridges, filtered, retry, recheck, dismiss } = useBridgeHistory(filter);
  const t = useTranslations().bridgeCard;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (bridges.length === 0) {
    return (
      <div
        className="px-5 py-6 text-center"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:NO BRIDGES YET:]
        </p>
        <p className="mt-2 text-[13px] text-[var(--lp-text-sub)]">
          Your bridge history shows up here once you move USDC in or out of Arc.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] py-6 text-center">
        [:NONE IN THIS FILTER:]
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {filtered.map((b) => (
        <BridgeRow
          key={b.id}
          bridge={b}
          expanded={expandedId === b.id}
          onToggle={() => setExpandedId((cur) => (cur === b.id ? null : b.id))}
          onRetry={() => retry(b.id)}
          onRecheck={() => recheck(b.id)}
          onDismiss={() => dismiss(b.id)}
          copy={t.row}
        />
      ))}
    </ul>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.1em] rounded-full transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{
        background: active ? 'var(--lp-dark)' : 'transparent',
        color: active ? 'var(--lp-accent)' : 'var(--lp-text-sub)',
      }}
    >
      <span>{label}</span>
      <span
        className="mono text-[9px] tabular-nums"
        style={{
          color: active ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
          opacity: active ? 0.9 : 0.7,
        }}
      >
        {count}
      </span>
    </button>
  );
}
