'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ARC_EXPLORER_TX } from '@/features/profile/config';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

/// The user's own money, in one list.
///
/// The feed below this on /activity is a network pulse with every amount and
/// party stripped, by design. It cannot answer "what did I do last week", and
/// until this component existed nothing in the product could: the rows were
/// being written durably and read only by the chat assistant.

type Item = Awaited<ReturnType<typeof api.myActivity>>['items'][number];

const TONE = {
  pending: 'var(--lp-accent)',
  failed: '#b03d3a',
} as const;

/// A cross-chain move settles on its own chain, so the receipt has to point at
/// that chain's explorer. Anything else happened on Arc.
function explorerFor(item: Item): string | null {
  if (!item.txHash) return null;
  const chain = item.chain ? SOURCE_CHAINS[item.chain as keyof typeof SOURCE_CHAINS] : undefined;
  return chain ? chain.explorerTx(item.txHash) : ARC_EXPLORER_TX(item.txHash);
}

function when(ts: number, justNow: string): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return justNow;
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MyMoneyLedger() {
  const t = useTranslations().activity.myMoney;
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api
      .myActivity()
      .then((r) => {
        setItems(r.items);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A bridge in flight changes status without the user doing anything, so
  // refresh when one reports progress rather than making them reload the page.
  useEffect(
    () =>
      subscribeLiveEvents((e) => {
        if (e.type === 'bridge.minted' || e.type === 'bridge.error') load();
      }),
    [load],
  );

  if (failed && !items) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:{t.eyebrow}:]
        </span>
        {items && items.length > 0 && (
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {t.count.replace('{n}', String(items.length))}
          </span>
        )}
      </div>

      {items === null ? (
        <p className="text-[13px] text-[var(--lp-text-muted)]">{t.loading}</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          {t.empty}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--lp-border-light)]">
          {items.map((item) => {
            const href = explorerFor(item);
            return (
              <li key={item.id} className="py-3 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] leading-snug text-[var(--lp-dark)]">{item.summary}</p>
                  <p className="mt-1 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {when(item.ts, t.justNow)}
                    {item.status !== 'done' && (
                      <>
                        {' · '}
                        <span style={{ color: item.status === 'failed' ? TONE.failed : TONE.pending }}>
                          {item.status === 'failed' ? t.failed : t.pending}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                  >
                    {t.receipt}
                  </a>
                ) : (
                  // A pooled-balance move has a Circle transfer id and no chain
                  // transaction, so there is nothing to link. Show the reference
                  // rather than an empty gap, so the row is still traceable.
                  item.refId && (
                    <span className="shrink-0 mono text-[10px] tracking-[0.08em] text-[var(--lp-text-muted)]">
                      {item.refId.slice(0, 10)}
                    </span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
