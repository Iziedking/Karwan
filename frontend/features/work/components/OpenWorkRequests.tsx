'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type WorkRequestView } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Chevron } from '@/features/market/components/YourTrades';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { localDay, microsToUsdc } from '../workModel';

/// Hourly work taking offers, in the market (view 32). Nothing shows when there is none.
export function OpenWorkRequests() {
  const all = useTranslations().work;
  const t = all.requests;
  const { locale } = useLocale();
  const [list, setList] = useState<WorkRequestView[]>([]);
  useEffect(() => {
    api.listWorkRequests().then((r) => setList(Array.isArray(r.requests) ? r.requests : [])).catch(() => {});
  }, []);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="hourly-title" className="mb-8">
      <h2 id="hourly-title" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.market.title}</h2>
      <ul className="mt-3 overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
        {list.map((r) => (
          <li key={r.id} className="border-b border-[var(--lp-border-light)] last:border-b-0">
            <Link
              href={`/work/requests/${r.id}`}
              className="flex min-h-[76px] items-center gap-4 px-4 py-3 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-[17px] font-semibold text-[var(--lp-dark)]">{r.title}</span>
                <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)]">
                  {[r.kind === 'hourly' ? fill(all.page.upTo, { n: r.maxHours }) : null, fill(r.kind === 'hourly' ? all.page.weeks : all.page.months, { n: r.periods }), fill(t.market.closes, { date: localDay(r.offersCloseAt, locale) })].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">
                {fill(r.kind === 'hourly' ? t.market.upTo : t.market.upToMonth, { amount: microsToUsdc(r.maxRateMicros) })}
              </span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
