'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBridges, type BridgePhase, type BridgeRecord } from '../hooks/useBridge';
import { BridgeRow } from './BridgeCard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const STUCK_AFTER_MS = 30 * 60 * 1000;
const PAGE_SIZE = 10;

export type HistoryFilter = 'all' | 'pending' | 'successful' | 'failed';

/// Shared classification helpers. Two consumers read this, the chip row
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

/// Shared hook. Returns sorted+filtered bridges + per-bucket counts so the
/// modal can render chips with live counts without rebuilding the math.
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

/// History modal. Self-contained card overlay opened from /bridge via a
/// "Bridge history" button, keeps the bridge page focused on the active
/// flow and stops the history list from creating endless scroll as more
/// bridges accumulate. Filter chips live inside the modal as its heading
/// row; the list is paginated (10 per page) so even 200 bridges read
/// comfortably. Closes on backdrop click, Esc, or the X button.
export function BridgeHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations().bridgeCard;
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { bridges, filtered, counts, retry, recheck, dismiss } = useBridgeHistory(filter);

  /// Reset to page 1 whenever the filter changes; otherwise paging through
  /// SUCCESSFUL then flipping to FAILED could leave the user on page 4 of
  /// 0, showing an empty list with no obvious recovery.
  useEffect(() => {
    setPage(1);
  }, [filter]);

  /// Esc closes. Only listen while open so we don't leak global handlers.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /// Hold the SSR fallback to null until we have a window. Without this,
  /// createPortal calls during the initial render on the server would
  /// throw (document is undefined).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 motion-safe:animate-[fadeUp_0.18s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bridge-history-title"
    >
      {/* Backdrop. Clicking off the panel closes. */}
      <button
        type="button"
        aria-label="Close history"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px) saturate(140%)',
          WebkitBackdropFilter: 'blur(6px) saturate(140%)',
        }}
      />
      <div
        className="relative w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          background: 'var(--lp-band-dark)',
          border: '1px solid var(--rule-dark)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
          boxShadow: '0 24px 64px -20px rgba(0,0,0,0.6)',
        }}
      >
        <div aria-hidden style={{ height: 3, background: 'var(--lp-accent)' }} />
        <header className="px-4 sm:px-5 py-4 border-b border-[var(--rule-dark)] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <span
              id="bridge-history-title"
              className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
            >
              [:HISTORY:]
            </span>
            <BridgeHistoryFilters filter={filter} onFilterChange={setFilter} counts={counts} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--ink-2)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
          {bridges.length === 0 ? (
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
          ) : filtered.length === 0 ? (
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] py-6 text-center">
              [:NONE IN THIS FILTER:]
            </p>
          ) : (
            <ul className="space-y-2">
              {pageItems.map((b) => (
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
        {totalPages > 1 && (
          <footer className="px-4 sm:px-5 py-3 border-t border-[var(--rule-dark)] flex items-center justify-between gap-3">
            <PagerButton
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <span aria-hidden>←</span> Prev
            </PagerButton>
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)] tabular-nums">
              Page {safePage} / {totalPages}
            </span>
            <PagerButton
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <span aria-hidden>→</span>
            </PagerButton>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/// Filter chip row. Rendered inside the modal header as the section's own
/// heading row, chips ARE the header, not a separate column on the page.
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
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
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

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono text-[10px] uppercase tracking-[0.14em] px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[rgba(255,255,255,0.06)] inline-flex items-center gap-1.5"
      style={{
        color: 'var(--ink-2)',
        border: '1px solid var(--rule-dark)',
        borderRadius: 6,
      }}
    >
      {children}
    </button>
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
