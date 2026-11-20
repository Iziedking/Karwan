'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, type ContestView, type WorkRequestView, type WorkRow } from '@/core/api';
import { microsToUsdc } from '@/features/contests/contestModel';
import { fill } from '@/features/deals/workspace/presentation';
import { localDay } from '@/features/work/workModel';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { CARD_CLASS } from '@/shared/components/Card';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Chevron } from './YourTrades';

/// Your contests and your work, the two lists Your trades opens (view 96,
/// Figma frame 5): what you posted, what you entered or offered on, and work
/// under way. Each row opens its own page.

const UNDER_WAY = new Set(['offering', 'offered', 'active', 'ending']);

type Row = { id: string; href: string; title: string; meta: string; amount: string };

export function YourContests() {
  const { locale } = useLocale();
  const hub = TRADE_ENTRY_COPY[locale].desk.hub;
  const t = useTranslations().contests;
  const mt = useMoneyText({ compact: true });
  const me = useAuth().address?.toLowerCase() ?? '';
  const mine = useQuery({ queryKey: ['contests', 'mine', me], queryFn: () => api.myContests(), enabled: !!me, staleTime: 15_000 });
  const date = (ms: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms);
  const row = (c: ContestView): Row => ({
    id: c.id,
    href: `/contests/${c.id}`,
    title: c.title,
    meta: [fill(t.market.entries, { n: c.entries }), fill(t.market.closes, { date: date(c.entriesBy) })].join(' · '),
    amount: mt.text(microsToUsdc(c.prizeMicros)),
  });
  return (
    <Lists
      title={hub.contests}
      loading={mine.isPending && !!me}
      empty={hub.nothingYet}
      groups={[
        { heading: hub.posted, rows: (mine.data?.posted ?? []).map(row) },
        { heading: hub.entered, rows: (mine.data?.entered ?? []).map(row) },
      ]}
    />
  );
}

export function YourWork() {
  const { locale } = useLocale();
  const hub = TRADE_ENTRY_COPY[locale].desk.hub;
  const mt = useMoneyText({ compact: true });
  const w = useTranslations().work.requests;
  const me = useAuth().address?.toLowerCase() ?? '';
  const requests = useQuery({ queryKey: ['work-requests', 'mine', me], queryFn: () => api.myWorkRequests(), enabled: !!me, staleTime: 15_000 });
  const work = useQuery({ queryKey: ['work', 'mine', me], queryFn: () => api.myWork(), enabled: !!me, staleTime: 15_000 });
  const asked = (r: WorkRequestView): Row => ({
    id: r.id, href: `/work/requests/${r.id}`, title: r.title, meta: fill(w.market.closes, { date: localDay(r.offersCloseAt, locale) }), amount: mt.text(microsToUsdc(r.maxRateMicros)),
  });
  const running = (w: WorkRow): Row => ({
    id: w.id, href: `/work/${w.id}`, title: w.title, meta: '', amount: mt.text(microsToUsdc(w.rateMicros)),
  });
  return (
    <Lists
      title={hub.work}
      loading={(requests.isPending || work.isPending) && !!me}
      empty={hub.nothingYet}
      groups={[
        { heading: hub.posted, rows: (requests.data?.posted ?? []).filter((r) => r.status === 'open').map(asked) },
        { heading: hub.offered, rows: (requests.data?.offered ?? []).map(asked) },
        { heading: hub.underWay, rows: (work.data?.work ?? []).filter((w) => UNDER_WAY.has(w.status)).map(running) },
      ]}
    />
  );
}

function Lists({ title, loading, empty, groups }: { title: string; loading: boolean; empty: string; groups: Array<{ heading: string; rows: Row[] }> }) {
  const shown = groups.filter((g) => g.rows.length > 0);
  return (
    <section aria-labelledby="yours-list-title" className="mt-6" data-yours-list>
      <h2 id="yours-list-title" className="text-[20px] font-medium tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
      {loading ? (
        <div aria-hidden className="mt-3 h-[76px] rounded-[20px] bg-[var(--raised)] motion-safe:animate-pulse" />
      ) : shown.length === 0 ? (
        <p className="mt-3 text-[15px] text-[var(--ink-secondary)]">{empty}</p>
      ) : (
        shown.map((g) => (
          <div key={g.heading} className="mt-5">
            <h3 className="text-[15px] font-semibold text-[var(--ink-secondary)]">{g.heading}</h3>
            <ul className={`${CARD_CLASS} mt-2 overflow-hidden`}>
              {g.rows.map((r) => (
                <li key={r.id} className="border-b border-[var(--line)] last:border-b-0">
                  <Link href={r.href} className="group flex min-h-[72px] items-center gap-4 px-4 py-3 hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)] sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-[16px] font-semibold text-[var(--ink)]">{r.title}</span>
                      {r.meta ? <span className="mt-0.5 block text-[14px] text-[var(--ink-secondary)]">{r.meta}</span> : null}
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--ink)]">{r.amount}</span>
                    <Chevron />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
