'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type DirectDeal } from '@/core/api';
import { stageOf, StageBadge, STAGE_META, type DealStage } from './DirectDealList';
import { cn } from '@/shared/utils/cn';
import { formatUsdc, shortAddress, shortHash, relativeTime } from '@/shared/utils/format';

type Filter = 'all' | 'active' | 'completed';

const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-delivery',
  'awaiting-first-release',
  'awaiting-final-release',
];

/// Public, read-only feed of direct deals across the network. Renders inside a
/// PageCard, so it carries no card chrome of its own.
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
                onClick={() => setFilter(t.key)}
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
          DIRECT + AGENT-MATCHED · LIVE ON ARC
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
          Couldn&apos;t load the deals feed.
        </p>
      ) : shown.length === 0 ? (
        <div className="px-6 md:px-8 py-12 text-center space-y-2">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {filter === 'all' ? 'EMPTY NETWORK' : 'NO MATCH'}
          </p>
          <p className="text-[13px] text-[var(--lp-text-sub)] max-w-[40ch] mx-auto leading-relaxed">
            {filter === 'all'
              ? 'No deals on the network yet. Open the first one.'
              : `No ${filter} deals right now.`}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--lp-border-light)]">
          {shown.map(({ deal, stage }) => {
            const meta = STAGE_META[stage];
            return (
              <li key={deal.jobId} className="group relative">
                <div className="block px-6 md:px-8 py-5 transition-colors hover:bg-[var(--lp-light)]">
                  <span
                    aria-hidden
                    className="absolute left-0 top-3 bottom-3 w-[3px] transition-opacity duration-200 opacity-50 group-hover:opacity-100"
                    style={{ background: meta.rail }}
                  />
                  <div className="flex items-center justify-between gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <StageBadge stage={stage} />
                        <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                          {relativeTime(deal.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="font-sans text-[26px] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
                          {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}
                        </span>
                        <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                          USDC
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] text-[var(--lp-text-sub)] line-clamp-1 max-w-[60ch]">
                        {deal.terms}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
                        PARTIES
                      </p>
                      <p className="mono text-[11px] tabular-nums text-[var(--lp-dark)]">
                        {shortAddress(deal.buyer)}
                        <span className="mx-1 text-[var(--lp-text-muted)]">→</span>
                        {shortAddress(deal.seller)}
                      </p>
                      <p className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
                        {shortHash(deal.jobId, 6, 4)}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
