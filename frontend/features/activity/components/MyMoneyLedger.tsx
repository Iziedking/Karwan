'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

/// How many rows show before the ledger asks to be expanded. The backend serves
/// up to 100 and the page has three other registers below this one, so an
/// uncapped list pushed the counters, filters and event stream off the screen.
const VISIBLE = 6;

type Row = { item: Item; repeat: number };

/// The row's sentence in the reader's language. The backend sends structured
/// `params` with a `t` naming the template; anything it cannot name falls back
/// to the English `summary` written at record time, which is what every row
/// logged before `params` existed still carries.
function lineFor(item: Item, texts: Record<string, string>): string {
  const p = (item as { params?: Record<string, string> | null }).params;
  const tpl = p?.t ? texts[p.t] : undefined;
  if (!tpl || !p) return item.summary;
  return tpl.replace(/\{(\w+)\}/g, (whole, key: string) => p[key] ?? whole);
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

export function MyMoneyLedger() {
  const t = useTranslations().activity.myMoney;
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => (items ? collapse(items, t.text) : []), [items, t.text]);
  const visible = expanded ? rows : rows.slice(0, VISIBLE);

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
          {visible.map(({ item, repeat }) => {
            const href = explorerFor(item);
            return (
              <li key={item.id} className="py-3 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] leading-snug text-[var(--lp-dark)]">{lineFor(item, t.text)}</p>
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

      {rows.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
        >
          {/* No count here. The header already states how many moves there
              were; a second number counting collapsed rows instead read as a
              contradiction (43 moves, "see all 20"). */}
          {expanded ? t.showLess : t.showAll}
        </button>
      )}
    </section>
  );
}
