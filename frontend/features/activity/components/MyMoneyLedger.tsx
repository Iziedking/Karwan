'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { ARC_EXPLORER_TX } from '@/features/profile/config';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import {
  filterByDirection,
  groupByDay,
  ledgerAmountLabel,
  ledgerContext,
  ledgerDirection,
  ledgerStatusTone,
  ledgerTitle,
  type LedgerFilter,
} from '../ledgerPresentation';
import { PortableReceipt, type PortableReceiptItem } from './PortableReceipt';
import { Icon } from '@/shared/components/Icon';

/// The user's own money, as a statement: one list, grouped by day, each
/// movement said once with its amount in its own column.
///
/// The feed below this on /activity is a network pulse with every amount and
/// party stripped, by design. It cannot answer "what did I do last week", and
/// until this component existed nothing in the product could: the rows were
/// being written durably and read only by the chat assistant.

type Item = Awaited<ReturnType<typeof api.myActivity>>['items'][number];

const TONE = {
  pending: 'var(--lp-accent-on-light)',
  failed: '#b03d3a',
} as const;

/// A cross-chain move settles on its own chain, so the receipt has to point at
/// that chain's explorer. Anything else happened on Arc.
function explorerFor(item: Pick<Item, 'txHash' | 'chain'>): string | null {
  if (!item.txHash) return null;
  const chain = item.chain ? SOURCE_CHAINS[item.chain as keyof typeof SOURCE_CHAINS] : undefined;
  return chain ? chain.explorerTx(item.txHash) : ARC_EXPLORER_TX(item.txHash);
}

/// A statement page holds a few days of movements, enough to read without
/// paging every few rows, bounded so a long history still loads in pieces.
const PAGE_SIZE = 25;

const FILTERS: readonly LedgerFilter[] = ['all', 'in', 'out'];

type Row = { item: Item; repeat: number };

/// A bridge that failed and retried twenty-four times is one thing that went
/// wrong, not twenty-four. Collapse neighbouring rows that read the same on
/// the statement (title, other side, amount, status, minute) into one row
/// carrying a repeat count. Only consecutive runs collapse, so the ledger stays
/// in time order and two genuine top-ups a week apart never merge. The newest
/// of a run represents it: it holds the receipt if one ever landed.
function collapse(items: Item[], keyOf: (item: Item) => string): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (last && keyOf(last.item) === keyOf(item)) {
      last.repeat += 1;
      continue;
    }
    rows.push({ item, repeat: 1 });
  }
  return rows;
}

export function findReceipt<T extends { id: string; refId: string | null; txHash: string | null }>(items: readonly T[], key: string): T | undefined {
  const wanted = key.trim().toLowerCase();
  if (!wanted) return undefined;
  return items.find((item) => [item.refId, item.id, item.txHash].some((value) => value?.toLowerCase() === wanted));
}

function ReceiptParam({ onChange }: { onChange: (key: string | null) => void }) {
  const receipt = useSearchParams().get('receipt');
  useEffect(() => onChange(receipt), [receipt, onChange]);
  return null;
}

function DirectionMark({ direction }: { direction: 'in' | 'out' | 'flat' }) {
  return (
    <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--lp-light)] text-[var(--lp-dark)]">
      {direction === 'flat' ? null : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {direction === 'in' ? <path d="M12 5v14m-6-6 6 6 6-6" /> : <path d="M12 19V5m-6 6 6-6 6 6" />}
        </svg>
      )}
    </span>
  );
}

export function MyMoneyLedger({
  /// Set when the ledger sits inside a panel that already carries the
  /// heading. The tile on /activity used the same heading, so the phrase
  /// appeared twice, two lines apart, which on a phone read as a rendering fault.
  nested = false,
}: {
  nested?: boolean;
} = {}) {
  const { locale, t: translations } = useLocale();
  const t = translations.activity.myMoney;
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedReceipt, setSelectedReceipt] = useState<PortableReceiptItem | null>(null);
  const [wantedReceipt, setWantedReceipt] = useState<string | null>(null);
  const openedReceipt = useRef<string | null>(null);

  const rows = useMemo(() => {
    if (!items) return [];
    // Compare what the row shows, so rows that read the same merge in every
    // locale, not just English.
    const keyOf = (item: Item) =>
      [ledgerTitle(item, t.kind, t.text), ledgerContext(item), ledgerAmountLabel(item.amountUsdc, item.kind), item.status, Math.floor(item.ts / 60_000)].join('|');
    return collapse(filterByDirection(items, filter), keyOf);
  }, [items, filter, t.kind, t.text]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const days = useMemo(
    () => groupByDay(rows.slice(pageStart, pageStart + PAGE_SIZE), (row) => row.item.ts),
    [rows, pageStart],
  );
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }), [locale]);
  const yearFormat = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }), [locale]);
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }), [locale]);

  useEffect(() => {
    setPage(1);
  }, [rows.length, filter]);

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

  // A notification links here with ?receipt=<reference or transaction hash>
  // and opens that movement's receipt once, even if the list reloads after.
  useEffect(() => {
    if (!items || !wantedReceipt || openedReceipt.current === wantedReceipt) return;
    const match = findReceipt(items, wantedReceipt);
    if (!match) return;
    openedReceipt.current = wantedReceipt;
    setSelectedReceipt(match);
  }, [items, wantedReceipt]);

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

  const dayLabel = (day: (typeof days)[number]) => {
    if (day.day === 'today') return t.today;
    if (day.day === 'yesterday') return t.yesterday;
    return new Date(day.start).getFullYear() === new Date().getFullYear()
      ? dayFormat.format(day.start)
      : yearFormat.format(day.start);
  };
  const timeLabel = (ts: number) => (Date.now() - ts < 60_000 ? t.justNow : timeFormat.format(ts));

  return (
    <section className="space-y-4">
      <Suspense fallback={null}>
        <ReceiptParam onChange={setWantedReceipt} />
      </Suspense>
      {!nested && (
        <span className="block text-[14px] font-semibold text-[var(--lp-text-sub)]">
          {t.eyebrow}
        </span>
      )}

      {items === null ? (
        <div
          role="status"
          aria-label={t.loading}
          className="h-1 w-full overflow-hidden bg-[var(--lp-border-light)]"
        >
          <span className="block h-full w-1/3 bg-[var(--lp-accent)] motion-safe:animate-pulse" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch] font-medium">
          {t.empty}
        </p>
      ) : (
        <>
          <fieldset className="min-w-0">
            <legend className="sr-only">{t.filter.aria}</legend>
            <div data-ledger-filter className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--tint)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                  className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-[14px] font-semibold transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)] ${
                    filter === option
                      ? 'bg-[var(--lp-card)] text-[var(--ink)] shadow-[0_0_0_1px_var(--lp-border-light)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'
                  }`}
                >
                  {t.filter[option]}
                </button>
              ))}
            </div>
          </fieldset>

          {rows.length === 0 ? (
            <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
              {filter === 'in' ? t.emptyIn : t.emptyOut}
            </p>
          ) : (
            <div className="space-y-5">
              {days.map((day) => (
                <section key={day.start} aria-label={dayLabel(day)} data-ledger-day>
                  <h3 className="border-b border-[var(--lp-border-light)] pb-2 text-[14px] font-semibold text-[var(--ink-secondary)]">
                    {dayLabel(day)}
                  </h3>
                  <ul className="divide-y divide-[var(--lp-border-light)]">
                    {day.rows.map(({ item, repeat }) => {
                      const amount = ledgerAmountLabel(item.amountUsdc, item.kind);
                      const direction = ledgerDirection(item.kind);
                      const title = ledgerTitle(item, t.kind, t.text);
                      const context = ledgerContext(item);
                      const statusColor = ledgerStatusTone(item.status) === 'failed' ? TONE.failed : TONE.pending;
                      return (
                        <li key={item.id} data-ledger-status={item.status} className="relative">
                          {item.status === 'pending' && (
                            <span
                              aria-hidden
                              className="absolute inset-y-3 -start-3 w-[2px] rounded-full motion-safe:animate-pulse motion-reduce:animate-none"
                              style={{ background: TONE.pending }}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(item)}
                            aria-label={[title, amount, t.viewReceipt].filter(Boolean).join('. ')}
                            className="grid min-h-16 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-3 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:gap-x-4"
                          >
                            <DirectionMark direction={direction} />
                            <span className="min-w-0">
                              <span className="block truncate text-[15px] font-medium leading-snug text-[var(--lp-dark)]">
                                {title}
                              </span>
                              <span className="mt-0.5 block line-clamp-2 break-words text-[14px] text-[var(--ink-secondary)] font-medium tabular-nums">
                                {timeLabel(item.ts)}
                                {context ? (
                                  <>
                                    {' · '}
                                    <span className="whitespace-nowrap">{context}</span>
                                  </>
                                ) : null}
                                {item.status !== 'done' && (
                                  <>
                                    {' · '}
                                    <span className="font-medium" style={{ color: statusColor }}>
                                      {item.status === 'failed' ? t.failed : t.pending}
                                    </span>
                                  </>
                                )}
                                {repeat > 1 && ` · ${amount
                                  ? t.repeatedEach.replace('{n}', String(repeat)).replace('{amount}', amount.replace(/^[+\-−]\s?/, ''))
                                  : t.repeated.replace('{n}', String(repeat))}`}
                              </span>
                            </span>
                            {amount ? (
                              <span
                                className="whitespace-nowrap text-end text-[15px] font-semibold tabular-nums"
                                style={{ color: direction === 'in' ? 'var(--lp-accent-on-light)' : 'var(--lp-dark)' }}
                              >
                                {amount}
                              </span>
                            ) : (
                              <span />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {rows.length > PAGE_SIZE && (
        <nav data-floating-avoid className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--lp-border-light)] pt-3" aria-label={translations.activity.view.pagerAria}>
          <span className="mono text-[13px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
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
              className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[var(--lp-border-light)] mono text-[14px] text-[var(--lp-text-sub)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] font-medium"
            >
              <Icon name="arrow-left" size={16} directional />
            </button>
            <span className="min-w-16 text-center mono text-[13px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
              aria-label={translations.activity.view.nextAria}
              className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[var(--lp-border-light)] mono text-[14px] text-[var(--lp-text-sub)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] font-medium"
            >
              <Icon name="arrow-right" size={16} directional />
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
