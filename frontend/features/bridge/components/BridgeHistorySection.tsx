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
  const messages = useTranslations();
  const a11y = messages.a11y;
  const t = messages.bridgeCard;
  const title = messages.bridgeChooser.transferHistory;
  const historyCopy = messages.bridgeChooser.history;
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
      className="fixed inset-0 z-[100] flex items-end sm:items-stretch sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bridge-history-title"
    >
      {/* Backdrop. Clicking off the panel closes. */}
      <button
        type="button"
        aria-label={a11y.closeHistory}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{
          background: 'rgba(0,0,0,0.55)',
        }}
      />
      <div
        className="karwan-sheet-enter relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] sm:h-full sm:max-h-none sm:rounded-none sm:rounded-s-[16px]"
        style={{
          width: 'min(640px, 100vw)',
          maxWidth: '640px',
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
        }}
      >
        <header className="space-y-4 border-b border-[var(--lp-border-light)] px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <h2
              id="bridge-history-title"
              className="text-[18px] font-semibold leading-tight text-[var(--lp-dark)]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={a11y.closeHistory}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--lp-text-sub)] transition-colors hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <BridgeHistoryFilters filter={filter} onFilterChange={setFilter} counts={counts} copy={historyCopy} />
        </header>
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          {bridges.length === 0 ? (
            <div className="px-2 py-5">
              <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{historyCopy.emptyTitle}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {historyCopy.emptyBody}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-[var(--lp-text-sub)]">
              {historyCopy.noneInFilter}
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
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--lp-border-light)] px-4 py-3 sm:px-5">
            <PagerButton
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <span aria-hidden>←</span> {historyCopy.previous}
            </PagerButton>
            <span className="text-[13px] tabular-nums text-[var(--lp-text-sub)]">
              {historyCopy.pageTemplate.replace('{page}', String(safePage)).replace('{total}', String(totalPages))}
            </span>
            <PagerButton
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {historyCopy.next} <span aria-hidden>→</span>
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
  copy,
}: {
  filter: HistoryFilter;
  onFilterChange: (next: HistoryFilter) => void;
  counts: { all: number; pending: number; successful: number; failed: number };
  copy: { all: string; pending: string; successful: string; failed: string };
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
      <FilterChip label={copy.all} count={counts.all} active={filter === 'all'} onClick={() => onFilterChange('all')} />
      <FilterChip label={copy.pending} count={counts.pending} active={filter === 'pending'} onClick={() => onFilterChange('pending')} />
      <FilterChip label={copy.successful} count={counts.successful} active={filter === 'successful'} onClick={() => onFilterChange('successful')} />
      <FilterChip label={copy.failed} count={counts.failed} active={filter === 'failed'} onClick={() => onFilterChange('failed')} />
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
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[var(--lp-dark)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-[var(--lp-light)]"
      style={{
        border: '1px solid var(--lp-border-light)',
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
      className="inline-flex min-h-11 w-full min-w-0 items-center justify-between gap-1.5 rounded-[10px] px-2.5 py-2 text-[12px] font-medium transition-colors sm:px-3 sm:text-[13px]"
      style={{
        background: active ? 'var(--lp-accent)' : 'var(--lp-card)',
        color: active ? 'var(--accent-ink)' : 'var(--lp-text-sub)',
        border: active ? '1px solid var(--lp-accent)' : '1px solid var(--lp-border-light)',
      }}
    >
      <span>{label}</span>
      <span
        className="text-[12px] tabular-nums"
        style={{
          color: active ? 'var(--accent-ink)' : 'var(--lp-text-sub)',
        }}
      >
        {count}
      </span>
    </button>
  );
}
