'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { ledgerAmountLabel, ledgerDirection, ledgerLine, ledgerReferenceLabel } from '@/features/activity/ledgerPresentation';
import { NOTIFY_TYPES } from '@/features/notifications/notificationTypes';
import { dealReference } from '@/features/deals/dealReference';
import { CARD_CLASS } from '@/shared/components/Card';
import { PortableReceipt, type PortableReceiptItem } from '@/features/activity/components/PortableReceipt';
import { explorerFor } from '@/features/activity/components/MyMoneyLedger';
import { isAgentMovement } from '../agentMovements';
import { formatLocal } from '../displayCurrency';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { useMoneyText } from '../hooks/useMoneyText';

type Item = Awaited<ReturnType<typeof api.myActivity>>['items'][number];

const SOFT = 'bg-[var(--raised)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';
const RECENT = 5;
/// The agents' movements are a slice of the whole ledger, so read further back
/// to find five of them.
const AGENT_WINDOW = 40;

/// The last five movements on the account, in the ledger's own words: the
/// sentence left, the signed amount right, the Karwan reference under it. The
/// sign says which way money went; no colour stands in for it (view 48). Each
/// row opens its receipt (view 51). With `agentsOnly` it lists only what the
/// agents spent and received, under its own title.
export function RecentMoney({ agentsOnly = false }: { agentsOnly?: boolean } = {}) {
  const messages = useTranslations();
  const copy = messages.money.home;
  const move = messages.moneyMove.home;
  const dealLabel = messages.moneyPage.deal;
  const ledgerCopy = messages.activity.myMoney;
  const texts = ledgerCopy.text;
  const { locale } = useLocale();
  const { currency, rate } = useDisplayCurrency();
  const mt = useMoneyText();
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<PortableReceiptItem | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    api
      .myActivity(agentsOnly ? AGENT_WINDOW : RECENT)
      .then((result) => {
        const list = agentsOnly ? result.items.filter(isAgentMovement) : result.items;
        setItems(list.slice(0, RECENT));
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [agentsOnly]);

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

  const titleId = agentsOnly ? 'money-agents-spent' : 'money-recent';
  const title = agentsOnly ? move.agentsSpent : copy.recentTitle;
  const empty = agentsOnly ? move.agentsSpentEmpty : copy.recentEmpty;

  return (
    <section aria-labelledby={titleId} className="space-y-4">
      <h2 id={titleId} className="text-[17px] font-semibold text-[var(--ink)]">{title}</h2>
      {failed && items !== null ? <p role="status" className="text-[15px] text-[var(--ink-secondary)]">{copy.recentError}</p> : null}
      {items === null ? (
        failed ? (
          <p className="text-[15px] text-[var(--ink)]">{copy.recentError}</p>
        ) : (
          <div aria-busy="true" className="space-y-3">
            <div className={`h-12 ${SOFT}`} />
            <div className={`h-12 ${SOFT}`} />
            <div className={`h-12 ${SOFT}`} />
          </div>
        )
      ) : items.length === 0 ? (
        <p className="text-[15px] text-[var(--ink-secondary)]">{empty}</p>
      ) : (
        <ul className={`${CARD_CLASS} divide-y divide-[var(--line)] px-2 lg:px-3`}>
          {items.map((item) => {
            const amount = ledgerAmountLabel(item.amountUsdc, item.kind);
            const reference = ledgerReferenceLabel(item.refId);
            const dealRef = item.jobId ? dealReference(item.jobId) : null;
            const direction = ledgerDirection(item.kind);
            const signed = item.amountUsdc ? Number(item.amountUsdc) * (direction === 'out' ? -1 : 1) : null;
            const local = signed !== null && direction !== 'flat' ? formatLocal(signed, currency, rate, locale, true) : null;
            const line = mt.line(ledgerLine(item, texts));
            return (
              <li key={item.id}>
                <button
                  type="button"
                  data-recent-row
                  onClick={() => setOpen(item as PortableReceiptItem)}
                  className="flex min-h-16 w-full items-center justify-between gap-4 rounded-[12px] px-3 py-3.5 text-start transition-colors duration-[var(--dur-press)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-snug text-[var(--ink)]">{line}</span>
                    <span className="mt-1 flex flex-wrap gap-x-3 text-[14px] text-[var(--ink-secondary)] font-medium">
                      {item.status === 'pending' ? <span>{copy.statusPending}</span> : null}
                      {item.status === 'failed' ? <span className="text-[var(--color-critical)]">{copy.statusFailed}</span> : null}
                      {dealRef ? <span className="font-semibold text-[var(--ink)]">{dealLabel.replace('{reference}', dealRef)}</span> : null}
                      {reference ? <span className="mono break-all tabular-nums">{reference}</span> : null}
                    </span>
                  </span>
                  {amount ? (
                    <span dir="ltr" className="flex shrink-0 flex-col items-end tabular-nums">
                      <span className="text-[15px] font-semibold text-[var(--ink)]">{local ?? amount}</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/activity"
        className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
      >
        {copy.allActivity}
      </Link>
      {open ? (
        <PortableReceipt
          item={open}
          copy={ledgerCopy}
          closeLabel={messages.common.close}
          proofHref={explorerFor(open)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
