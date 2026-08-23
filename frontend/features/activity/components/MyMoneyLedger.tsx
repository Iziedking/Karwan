'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ARC_EXPLORER_TX } from '@/features/profile/config';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import {
  ledgerAmountLabel,
  ledgerDirection,
  ledgerReferenceLabel,
  ledgerStatusTone,
} from '../ledgerPresentation';
import { readableMovementText } from '../receiptPresentation';
import { PortableReceipt, type PortableReceiptItem } from './PortableReceipt';

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
function explorerFor(item: Pick<Item, 'txHash' | 'chain'>): string | null {
  if (!item.txHash) return null;
  const chain = item.chain ? SOURCE_CHAINS[item.chain as keyof typeof SOURCE_CHAINS] : undefined;
  return chain ? chain.explorerTx(item.txHash) : ARC_EXPLORER_TX(item.txHash);
}

/// Keep the money register useful on a phone and bounded on desktop. Unlike
/// the event pulse, this is a durable history, so it gets real pagination
/// rather than a "show everything" expansion.
const PAGE_SIZE = 6;

type Row = { item: Item; repeat: number };

/// The row's sentence in the reader's language. The backend sends structured
/// `params` with a `t` naming the template; anything it cannot name falls back
/// to the English `summary` written at record time, which is what every row
/// logged before `params` existed still carries.
function lineFor(item: Item, texts: Record<string, string>): string {
  const p = (item as { params?: Record<string, string> | null }).params;
  const tpl = p?.t ? texts[p.t] : undefined;
  if (!tpl || !p) return readableMovementText(item.summary);
  return readableMovementText(tpl.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = p[key] ?? whole;
    return key === 'to' && value.length > 12 ? 'counterparty' : value;
  }));
}

/// A bridge that failed and retried twenty-four times is one thing that went
/// wrong, not twenty-four. Collapse neighbouring rows that say the same thing
/// with the same status into one row carrying a repeat count. Only consecutive
/// runs collapse, so the ledger stays in time order and two genuine top-ups a
/// week apart never merge. The newest of a run represents it: it holds the
/// receipt if one ever landed.
function collapse(items: Item[], texts: Record<string, string>): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    // Compare the rendered line, not the raw summary: two rows that read the
    // same to the user should collapse in every locale, not just English.
    if (
      last &&
      lineFor(last.item, texts) === lineFor(item, texts) &&
      last.item.status === item.status
    ) {
      last.repeat += 1;
      continue;
    }
    rows.push({ item, repeat: 1 });
  }
  return rows;
}

function when(ts: number, justNow: string): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return justNow;
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MyMoneyLedger({
  /// Set when the ledger sits inside a panel that already carries the
  /// `[:YOUR MONEY:]` label. The tile on /activity did, so the phrase appeared
  /// twice, two lines apart, which on a phone read as a rendering fault.
  nested = false,
}: {
  nested?: boolean;
} = {}) {
  const translations = useTranslations();
  const t = translations.activity.myMoney;
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [copiedReference, setCopiedReference] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PortableReceiptItem | null>(null);

  const rows = useMemo(() => (items ? collapse(items, t.text) : []), [items, t.text]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visible = rows.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

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

  async function copyReference(reference: string) {
    try {
      await navigator.clipboard.writeText(reference);
      setCopiedReference(reference);
      window.setTimeout(() => setCopiedReference(null), 1500);
    } catch {
      // The complete reference remains selectable when clipboard access is unavailable.
    }
  }

  if (failed && !items) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        {!nested && (
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{t.eyebrow}:]
          </span>
        )}
        {items && items.length > 0 && (
          <span className="ms-auto mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {t.count.replace('{n}', String(items.length))}
          </span>
        )}
      </div>

      {items === null ? (
        <div
          role="status"
          aria-label={t.loading}
          className="h-1 w-full overflow-hidden bg-[var(--lp-border-light)]"
        >
          <span className="block h-full w-1/3 bg-[var(--lp-accent)] motion-safe:animate-pulse" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          {t.empty}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--lp-border-light)]">
          {visible.map(({ item, repeat }) => {
            const href = explorerFor(item);
            return (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug text-[var(--lp-dark)]">{lineFor(item, t.text)}</p>
                  <p className="mt-1 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {when(item.ts, t.justNow)}
                    {item.status !== 'done' && (
                      <>
                        {' · '}
                        <span style={{ color: ledgerStatusTone(item.status) === 'failed' ? TONE.failed : TONE.pending }}>
                          {item.status === 'failed' ? t.failed : t.pending}
                        </span>
                      </>
                    )}
                    {repeat > 1 && (
                      <>
                        {' · '}
                        <span className="tabular-nums">
                          {t.repeated.replace('{n}', String(repeat))}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {/* The amount, on the row. It was only ever on the receipt, so
                    the list of everything that happened to your money never
                    showed how much: "Released milestone 2 on deal 0x…" and a
                    timestamp. Signed by direction, because one list holds both
                    money in and money out. */}
                {(() => {
                  const amount = ledgerAmountLabel(item.amountUsdc, item.kind);
                  if (!amount) return null;
                  return (
                    <span
                      className="shrink-0 mono text-[12px] font-semibold tabular-nums tracking-[0.02em]"
                      style={{
                        color:
                          ledgerDirection(item.kind) === 'in'
                            ? 'var(--lp-accent)'
                            : 'var(--lp-dark)',
                      }}
                    >
                      {amount}
                    </span>
                  );
                })()}
                <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-x-3 gap-y-1 sm:w-auto sm:justify-end sm:gap-1">
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                    >
                      {t.receiptProof}
                    </a>
                  )}
                  {(() => {
                    const reference = ledgerReferenceLabel(item.refId);
                    if (!reference) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => copyReference(reference)}
                        aria-label={`${t.receipt}: ${reference}`}
                        className="inline-flex min-h-11 max-w-[48%] items-center gap-1 mono text-[10px] tracking-[0.08em] text-[var(--lp-text-muted)] transition-colors hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                      >
                        <span className="break-all text-start">{reference}</span>
                        <span aria-hidden>{copiedReference === reference ? '✓' : '⧉'}</span>
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setSelectedReceipt(item)}
                    className="inline-flex min-h-11 items-center px-2 mono text-[10px] uppercase tracking-[0.12em] font-bold text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                  >
                    {t.viewReceipt}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > PAGE_SIZE && (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--lp-border-light)] pt-3" aria-label={translations.activity.view.pagerAria}>
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            {translations.activity.view.countRange
              .replace('{start}', String(pageStart + 1))
              .replace('{end}', String(Math.min(pageStart + PAGE_SIZE, rows.length)))
              .replace('{total}', String(rows.length))}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
              aria-label={translations.activity.view.prevAria}
              className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[var(--lp-border-light)] mono text-[11px] text-[var(--lp-text-sub)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              ←
            </button>
            <span className="min-w-16 text-center mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
              aria-label={translations.activity.view.nextAria}
              className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[var(--lp-border-light)] mono text-[11px] text-[var(--lp-text-sub)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              →
            </button>
          </div>
        </nav>
      )}

      {selectedReceipt && (
        <PortableReceipt
          item={selectedReceipt}
          copy={t}
          closeLabel={translations.common.close}
          proofHref={explorerFor(selectedReceipt)}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </section>
  );
}
