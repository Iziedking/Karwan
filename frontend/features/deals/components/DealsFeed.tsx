'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type DirectDeal } from '@/core/api';
import { stageOf, StageBadge, type DealStage } from './DirectDealList';
import { cn } from '@/shared/utils/cn';
import { formatUsdc, shortAddress, shortHash, relativeTime } from '@/shared/utils/format';

type Filter = 'all' | 'active' | 'completed';

const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-delivery',
  'awaiting-first-release',
  'awaiting-final-release',
];

/// Public, read-only feed of direct deals across the network. Renders inside an
/// AppUI Section, so it carries no card chrome of its own.
export function DealsFeed() {
  const [deals, setDeals] = useState<DirectDeal[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    api
      .dealsFeed()
      .then((d) => {
        if (cancelled) return;
        setDeals(d.deals);
        setFetchState('ready');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: withStage.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'completed', label: 'Completed', count: completedCount },
  ];

  return (
    <div>
      <div className="px-7 md:px-10 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--lp-border-light)]">
        <div className="inline-flex rounded-full p-1 gap-1 bg-[var(--lp-light)]">
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12px] font-semibold tracking-tight transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                  active
                    ? 'bg-[var(--lp-dark)] text-white'
                    : 'text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]',
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'ml-1.5 tabular-nums',
                    active ? 'text-white/55' : 'text-[var(--lp-text-muted)]',
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mono text-[11px] uppercase tracking-[0.06em] text-[var(--lp-text-muted)]">
          direct deals · live on Arc
        </p>
      </div>

      {fetchState === 'loading' ? (
        <div className="px-7 md:px-10 py-6 space-y-3">
          <div className="h-12 rounded-xl bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
          <div className="h-12 rounded-xl bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
          <div className="h-12 rounded-xl bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
        </div>
      ) : fetchState === 'error' ? (
        <p className="px-7 md:px-10 py-12 text-center text-[13px] text-[var(--lp-text-muted)]">
          Couldn&apos;t load the deals feed.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-7 md:px-10 py-12 text-center text-[13px] text-[var(--lp-text-sub)]">
          {filter === 'all'
            ? 'No deals on the network yet. Open the first one.'
            : `No ${filter} deals right now.`}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--lp-border-light)]">
          {shown.map(({ deal, stage }) => (
            <li
              key={deal.jobId}
              className="px-7 md:px-10 py-4 flex items-start justify-between gap-4 transition-colors hover:bg-[var(--lp-light)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-sans text-[17px] font-bold tabular-nums tracking-[-0.01em] text-[var(--lp-dark)]">
                    {formatUsdc(deal.dealAmountUsdc)}
                  </span>
                  <StageBadge stage={stage} />
                </div>
                <p className="mt-1 text-[13px] text-[var(--lp-text-sub)] line-clamp-1">
                  {deal.terms}
                </p>
                <p className="mt-1.5 mono text-[10px] text-[var(--lp-text-muted)]">
                  {shortAddress(deal.buyer)} → {shortAddress(deal.seller)} ·{' '}
                  {shortHash(deal.jobId, 6, 4)}
                </p>
              </div>
              <span className="mono text-[10px] text-[var(--lp-text-muted)] shrink-0 mt-1">
                {relativeTime(deal.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
