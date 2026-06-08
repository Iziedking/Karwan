'use client';
import { useMemo, useState } from 'react';
import { useBridges, type BridgePhase } from '../hooks/useBridge';
import { BridgeRow } from './BridgeCard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const STUCK_AFTER_MS = 30 * 60 * 1000;

type Filter = 'all' | 'pending' | 'successful' | 'failed';

/// Persistent bridge history on /bridge that survives the direction toggle —
/// the BridgeCard's in-card modal was scoped to inbound bridges only and
/// users couldn't browse outbound history without flipping FROM ARC. This
/// section sits below the active card and shows every bridge in localStorage
/// (both directions), filtered by status. Identity-keyed via useBridges()
/// so web3 wallet users and email/Circle users see their own history without
/// any auth-method branching. Empty store renders the empty state, never
/// a fixed-height skeleton — the page only grows when there's history.
export function BridgeHistorySection() {
  const { bridges, retry, recheck, dismiss, isActive } = useBridges();
  const t = useTranslations().bridgeCard;
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isStuckBridge = (phase: BridgePhase, startedAt: number) =>
    (phase === 'attesting' || phase === 'minting') &&
    Date.now() - startedAt > STUCK_AFTER_MS;

  const filtered = useMemo(() => {
    const sorted = [...bridges].sort((a, b) => b.startedAt - a.startedAt);
    if (filter === 'all') return sorted;
    return sorted.filter((b) => {
      const stuck = isStuckBridge(b.phase, b.startedAt);
      if (filter === 'successful') return b.phase === 'done';
      if (filter === 'failed') return b.phase === 'error' || stuck;
      /// 'pending' = anything still in motion (and not yet stuck — stuck
      /// bridges count as failed so the user has a clear retry/dismiss path).
      if (filter === 'pending') return isActive(b.phase) && !stuck;
      return true;
    });
  }, [bridges, filter, isActive]);

  const counts = useMemo(() => {
    let pending = 0;
    let successful = 0;
    let failed = 0;
    for (const b of bridges) {
      const stuck = isStuckBridge(b.phase, b.startedAt);
      if (b.phase === 'done') successful += 1;
      else if (b.phase === 'error' || stuck) failed += 1;
      else if (isActive(b.phase)) pending += 1;
    }
    return { all: bridges.length, pending, successful, failed };
  }, [bridges, isActive]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:HISTORY:]
        </span>
        <div
          className="inline-flex p-1 gap-1"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderRadius: 999,
          }}
        >
          <FilterChip label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label="Pending" count={counts.pending} active={filter === 'pending'} onClick={() => setFilter('pending')} />
          <FilterChip label="Successful" count={counts.successful} active={filter === 'successful'} onClick={() => setFilter('successful')} />
          <FilterChip label="Failed" count={counts.failed} active={filter === 'failed'} onClick={() => setFilter('failed')} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] py-6 text-center">
          [:NONE IN THIS FILTER:]
        </p>
      ) : (
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
      )}
    </div>
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
