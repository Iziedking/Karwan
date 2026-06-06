'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { stageOf, StageBadge, STAGE_META, type DealStage } from './DirectDealList';
import { useDirectDeals } from '../hooks/useDirectDeals';
import { cn } from '@/shared/utils/cn';
import { formatUsdc, shortAddress, shortHash, relativeTime } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type Filter = 'all' | 'active' | 'completed';

const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-delivery',
  'awaiting-first-release',
  'awaiting-final-release',
];

/// Personal deal feed on the home page. Shows only deals where the signed-in
/// user is the buyer or seller. Public "what's happening on Karwan" content
/// lives in the NetworkTicker — that one shows masked network-wide activity
/// and stays as the public surface. Renders inside a PageCard.
export function DealsFeed() {
  const tr = useTranslations().dealsFeed;
  const { deals, fetchState: hookState } = useDirectDeals();
  // Map the shared hook's states onto this component's prior tri-state so the
  // existing branches below stay untouched. 'idle' (signed-out) reads as
  // 'ready' here because the empty-list branch handles both.
  const fetchState: 'loading' | 'ready' | 'error' =
    hookState === 'error' ? 'error' : hookState === 'success' || hookState === 'idle' ? 'ready' : 'loading';
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  // Rows per page. The book grows over time; pagination keeps the home page
  // from becoming a scroll trap.
  const PAGE_SIZE = 6;

  const withStage = useMemo(
    () => deals.map((d) => ({ deal: d, stage: stageOf(d) })),
    [deals],
  );
  const activeCount = withStage.filter((x) => ACTIVE_STAGES.includes(x.stage)).length;
  const completedCount = withStage.filter((x) => x.stage === 'settled').length;

  const shown = withStage.filter((x) => {
    if (filter === 'active') return ACTIVE_STAGES.includes(x.stage);
    if (filter === 'completed') return x.stage === 'settled';
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  // Clamp the cursor if a filter switch puts it past the end.
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = shown.slice(pageStart, pageStart + PAGE_SIZE);
  const canPrev = safePage > 0;
  const canNext = safePage < pageCount - 1;

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: tr.tabs.all, count: withStage.length },
    { key: 'active', label: tr.tabs.active, count: activeCount },
    { key: 'completed', label: tr.tabs.completed, count: completedCount },
  ];

  return (
    <div>
      <div className="px-6 md:px-8 pt-5 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--lp-border-light)]">
        <div
          className="inline-flex items-center gap-1 p-1"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 9,
            borderTopRightRadius: 9,
            borderBottomLeftRadius: 9,
            borderBottomRightRadius: 2,
          }}
        >
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setFilter(t.key);
                  setPage(0);
                }}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                )}
                style={{
                  background: active ? 'var(--lp-card)' : 'transparent',
                  color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
                  border: active ? '1px solid var(--lp-border-light)' : '1px solid transparent',
                  borderTopLeftRadius: 7,
                  borderTopRightRadius: 7,
                  borderBottomLeftRadius: 7,
                  borderBottomRightRadius: 2,
                  boxShadow: active ? '0 1px 0 rgba(0,0,0,0.04)' : 'none',
                }}
              >
                {t.label}
                <span
                  className="tabular-nums"
                  style={{
                    color: active ? 'var(--lp-text-muted)' : 'var(--lp-text-muted)',
                    opacity: active ? 1 : 0.7,
                  }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {tr.liveEyebrow}
        </p>
      </div>

      {fetchState === 'loading' ? (
        <div className="px-6 md:px-8 py-6 space-y-3">
          <div className="h-14 bg-black/[0.05] animate-pulse motion-reduce:animate-none rounded" />
          <div className="h-14 bg-black/[0.05] animate-pulse motion-reduce:animate-none rounded" />
          <div className="h-14 bg-black/[0.05] animate-pulse motion-reduce:animate-none rounded" />
        </div>
      ) : fetchState === 'error' ? (
        <p className="px-6 md:px-8 py-12 text-center mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {tr.errorBody}
        </p>
      ) : shown.length === 0 ? (
        <div className="px-6 md:px-8 py-12 text-center space-y-2">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {filter === 'all' ? tr.empty.noDealsTag : tr.empty.noMatchTag}
          </p>
          <p className="text-[13px] text-[var(--lp-text-sub)] max-w-[40ch] mx-auto leading-relaxed">
            {filter === 'all'
              ? tr.empty.promptAll
              : filter === 'active'
                ? tr.empty.promptFilteredActive
                : tr.empty.promptFilteredCompleted}
          </p>
        </div>
      ) : (
        <>
        <ul className="divide-y divide-[var(--lp-border-light)]">
          {pageRows.map(({ deal, stage }) => {
            const meta = STAGE_META[stage];
            return (
              <li key={deal.jobId} className="relative">
                <Link
                  href={`/deals/${deal.jobId}`}
                  className="group relative flex flex-col md:grid md:grid-cols-[auto_1fr_auto] items-stretch md:items-center gap-2 md:gap-6 px-5 md:px-8 py-4 md:py-5 transition-colors duration-150 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-inset"
                >
                  <span
                    aria-hidden
                    className="absolute start-0 top-2 bottom-2 w-[3px] opacity-60 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ background: meta.rail }}
                  />

                  {/* Mobile row 1 / desktop col 1: status + age (left) + amount (right on mobile) */}
                  <div className="flex items-center justify-between md:justify-start gap-3 md:gap-3 md:shrink-0 md:min-w-[180px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <StageBadge stage={stage} />
                      <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums truncate">
                        {relativeTime(deal.createdAt)}
                      </span>
                    </div>
                    {/* Amount appears here on mobile, hidden on desktop (renders below as its own col) */}
                    <div className="flex md:hidden items-baseline gap-1.5 shrink-0">
                      <span className="font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.025em] leading-none text-[var(--lp-dark)]">
                        {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}
                      </span>
                      <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                        USDC
                      </span>
                    </div>
                  </div>

                  {/* Desktop col 2: amount (hidden on mobile, already shown above) */}
                  <div className="hidden md:flex min-w-0 items-baseline gap-2">
                    <span className="font-sans text-[28px] font-extrabold tabular-nums tracking-[-0.025em] leading-none text-[var(--lp-dark)]">
                      {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                      USDC
                    </span>
                  </div>

                  {/* Mobile row 2 / desktop col 3: parties (left) + chevron (right) */}
                  <div className="flex items-center justify-between md:justify-start gap-3 md:gap-5 md:shrink-0">
                    <div className="text-start md:text-end min-w-0">
                      <p className="mono text-[11px] tabular-nums text-[var(--lp-dark)] leading-none truncate">
                        {shortAddress(deal.buyer)}
                        <span className="mx-1 text-[var(--lp-text-muted)]">→</span>
                        {shortAddress(deal.seller)}
                      </p>
                      <p className="mt-1.5 mono text-[10px] tabular-nums uppercase tracking-[0.08em] text-[var(--lp-text-muted)] truncate">
                        {shortHash(deal.jobId, 6, 4)}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="text-[16px] leading-none transition-transform duration-150 group-hover:translate-x-1 shrink-0"
                      style={{ color: 'var(--lp-text-muted)' }}
                    >
                      ›
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {pageCount > 1 && (
          <div className="px-6 md:px-8 py-5 flex items-center justify-between gap-4 border-t border-[var(--lp-border-light)]">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
              {tr.pager.pageOf
                .replace('{page}', String(safePage + 1))
                .replace('{total}', String(pageCount))}
              <span className="mx-2 opacity-50">·</span>
              {(shown.length === 1 ? tr.pager.countSingle : tr.pager.countPlural).replace(
                '{n}',
                String(shown.length),
              )}
            </p>
            <div className="flex items-center gap-2">
              <PagerButton
                direction="prev"
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              />
              <PagerButton
                direction="next"
                disabled={!canNext}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              />
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}

/// Round pager button used on the book footer. Lime-rimmed on hover, faded
/// when at the start/end of the range.
function PagerButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const tr = useTranslations().dealsFeed.pager;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? tr.prevAria : tr.nextAria}
      className={cn(
        'group inline-flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150',
        'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
        disabled
          ? 'cursor-not-allowed opacity-30'
          : 'cursor-pointer hover:bg-[var(--lp-light)] hover:border-[var(--lp-accent)] hover:-translate-y-0.5',
      )}
      style={{
        background: 'var(--lp-card)',
        borderColor: 'var(--lp-border-light)',
        boxShadow: disabled ? 'none' : '0 1px 0 rgba(0,0,0,0.04), 0 6px 16px -12px rgba(0,0,0,0.12)',
      }}
    >
      <span
        aria-hidden
        className="text-[14px] leading-none transition-transform duration-150"
        style={{ color: 'var(--lp-dark)' }}
      >
        {direction === 'prev' ? '‹' : '›'}
      </span>
    </button>
  );
}
