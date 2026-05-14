'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type DirectDeal } from '@/core/api';
import { stageOf, StageBadge, type DealStage } from './DirectDealList';
import { formatUsdc, shortAddress, shortHash, relativeTime } from '@/shared/utils/format';

type Filter = 'all' | 'active' | 'completed';

const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-delivery',
  'awaiting-first-release',
  'awaiting-final-release',
];

/// Public, read-only feed of direct deals across the network. Backs the home
/// page section so a visitor sees the platform is live.
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
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-line)] flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg p-0.5 gap-0.5 bg-[var(--color-surface-2)] border border-[var(--color-line)]">
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-colors ${
                  active
                    ? 'bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]'
                    : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-[var(--color-ink-faint)] tabular-nums">{t.count}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mono text-[var(--color-ink-faint)]">direct deals · live on Arc</p>
      </div>

      {fetchState === 'loading' ? (
        <p className="px-5 py-12 text-center text-[13px] text-[var(--color-ink-faint)]">
          Loading deals…
        </p>
      ) : fetchState === 'error' ? (
        <p className="px-5 py-12 text-center text-[13px] text-[var(--color-ink-faint)]">
          Couldn&apos;t load the deals feed.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-5 py-12 text-center text-[13px] text-[var(--color-ink-dim)]">
          {filter === 'all'
            ? 'No deals on the network yet. Open the first one.'
            : `No ${filter} deals right now.`}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {shown.map(({ deal, stage }) => (
            <li
              key={deal.jobId}
              className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[18px] font-medium tabular-nums tracking-tight"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {formatUsdc(deal.dealAmountUsdc)}
                  </span>
                  <StageBadge stage={stage} />
                </div>
                <p className="text-[12px] text-[var(--color-ink-dim)] mt-1 line-clamp-1">
                  {deal.terms}
                </p>
                <p className="text-[10px] mono text-[var(--color-ink-faint)] mt-1.5">
                  {shortAddress(deal.buyer)} → {shortAddress(deal.seller)} ·{' '}
                  {shortHash(deal.jobId, 6, 4)}
                </p>
              </div>
              <span className="text-[10px] mono text-[var(--color-ink-faint)] shrink-0 mt-1">
                {relativeTime(deal.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
