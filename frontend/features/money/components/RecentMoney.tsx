'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { ledgerAmountLabel, ledgerDirection, ledgerLine, ledgerReferenceLabel } from '@/features/activity/ledgerPresentation';
import { NOTIFY_TYPES } from '@/features/notifications/notificationTypes';

type Item = Awaited<ReturnType<typeof api.myActivity>>['items'][number];

const SOFT = 'bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';
const RECENT = 5;

/// The last five movements on the account, in the ledger's own words: the
/// sentence left, the signed amount right, the Karwan reference under it, and
/// a word beside every colour.
export function RecentMoney() {
  const messages = useTranslations();
  const copy = messages.money.home;
  const texts = messages.activity.myMoney.text;
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    api
      .myActivity(RECENT)
      .then((result) => {
        setItems(result.items.slice(0, RECENT));
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Money that moves while the page is open appears without a reload. The
  // several events one movement produces load the list once.
  useEffect(() => {
    const unsubscribe = subscribeLiveEvents((event) => {
      if (!NOTIFY_TYPES.has(event.type) && event.type !== 'bridge.error') return;
      if (Object.keys(event.payload ?? {}).length === 0) return;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(load, 600);
    });
    return () => {
      unsubscribe();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [load]);

  return (
    <section aria-labelledby="money-recent" className="space-y-4">
      <h2 id="money-recent" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.recentTitle}</h2>
      {items === null ? (
        failed ? (
          <p className="text-[15px] text-[var(--lp-dark)]">{copy.recentError}</p>
        ) : (
          <div aria-busy="true" className="space-y-3">
            <div className={`h-12 ${SOFT}`} />
            <div className={`h-12 ${SOFT}`} />
            <div className={`h-12 ${SOFT}`} />
          </div>
        )
      ) : items.length === 0 ? (
        <p className="text-[15px] text-[var(--lp-text-sub)]">{copy.recentEmpty}</p>
      ) : (
        <ul className="divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {items.map((item) => {
            const amount = ledgerAmountLabel(item.amountUsdc, item.kind);
            const reference = ledgerReferenceLabel(item.refId);
            return (
              <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] leading-snug text-[var(--lp-dark)]">{ledgerLine(item, texts)}</span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-[var(--lp-text-sub)]">
                    {item.status === 'pending' ? <span>{copy.statusPending}</span> : null}
                    {item.status === 'failed' ? <span className="text-[var(--color-critical)]">{copy.statusFailed}</span> : null}
                    {reference ? <span className="mono break-all tabular-nums">{reference}</span> : null}
                  </span>
                </span>
                {amount ? (
                  <span
                    dir="ltr"
                    className={`shrink-0 text-[15px] font-semibold tabular-nums ${ledgerDirection(item.kind) === 'in' ? 'text-[var(--color-positive)]' : 'text-[var(--lp-dark)]'}`}
                  >
                    {amount}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/activity"
        className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {copy.allActivity}
      </Link>
    </section>
  );
}
