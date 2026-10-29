'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type ContestView } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Chevron } from '@/features/market/components/YourTrades';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { microsToUsdc } from '../contestModel';

/// Open contests in the market (view 40). Nothing shows when there are none.
export function OpenContests() {
  const t = useTranslations().contests;
  const { locale } = useLocale();
  const [list, setList] = useState<ContestView[]>([]);
  useEffect(() => {
    api.listContests().then((r) => setList(Array.isArray(r.contests) ? r.contests : [])).catch(() => {});
  }, []);
  if (list.length === 0) return null;
  const date = (ms: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms);
  return (
    <section aria-labelledby="contests-title" className="mb-8">
      <h2 id="contests-title" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.market.title}</h2>
      <ul className="mt-3 overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
        {list.map((c) => (
          <li key={c.id} className="border-b border-[var(--lp-border-light)] last:border-b-0">
            <Link
              href={`/contests/${c.id}`}
              className="flex min-h-[76px] items-center gap-4 px-4 py-3 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold text-[var(--lp-dark)]">{c.title}</span>
                <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)]">
                  {c.shares.length === 1 ? t.market.winnersOne : fill(t.market.winnersMany, { n: c.shares.length })} · {fill(t.market.entries, { n: c.entries })} · {fill(t.market.closes, { date: date(c.entriesBy) })}
                </span>
              </span>
              <span className="shrink-0 text-[17px] font-semibold tabular-nums text-[var(--lp-dark)]">{microsToUsdc(c.prizeMicros)} USDC</span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
