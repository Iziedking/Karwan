'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type FactoringOffer } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { LINK, SECONDARY } from '@/shared/ui/controls';
import { positionsSummary } from '../deskModel';
import { PaySeller } from './PaySeller';

const SHOWN = ['awaiting_financier', 'accepted', 'settled', 'repaid', 'defaulted', 'waived'] as const;
type ShownStatus = (typeof SHOWN)[number];
const PAGE_SIZE = 4;

const DOT: Record<ShownStatus, string> = {
  awaiting_financier: 'bg-[var(--warn)]',
  accepted: 'bg-[var(--lp-accent)]',
  settled: 'bg-[var(--color-positive)]',
  repaid: 'bg-[var(--color-positive)]',
  defaulted: 'bg-[var(--color-critical)]',
  waived: 'bg-[var(--lp-border-light)]',
};

/// The financier's own money first: what is out, what is expected back, and
/// each position with whose move it is. Hidden until there is a position.
export function FactoringPositionsPanel() {
  const t = useTranslations().financierDashboard.positions;
  const { locale } = useLocale();
  const [offers, setOffers] = useState<FactoringOffer[]>([]);
  const [page, setPage] = useState(0);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    const load = () =>
      api
        .listMyFactoringOffers()
        .then((result) =>
          setOffers(
            result.asFinancier
              .filter((offer) => (SHOWN as readonly string[]).includes(offer.status))
              .sort((a, b) => (b.updatedAt ?? b.offeredAt) - (a.updatedAt ?? a.offeredAt)),
          ),
        )
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(offers.length / PAGE_SIZE) - 1);
    setPage((current) => Math.min(current, lastPage));
  }, [offers.length]);

  if (!offers.length) return null;

  const summary = positionsSummary(offers);
  const pageCount = Math.ceil(offers.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const visible = offers.slice(pageStart, pageStart + PAGE_SIZE);
  const when = (offer: FactoringOffer) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
      offer.settledAt ?? offer.acceptedAt ?? offer.updatedAt ?? offer.offeredAt,
    );

  return (
    <section aria-labelledby="your-positions" className="pt-8" data-guide="financier-positions">
      <h2 id="your-positions" className="text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em] text-[var(--lp-dark)]">
        {t.title}
      </h2>
      <p className="mt-1 text-[15px] font-medium tabular-nums text-[var(--lp-text-sub)]">
        {t.summary
          .replace('{active}', String(summary.active))
          .replace('{out}', formatUsdc(summary.outUsdc, { withSuffix: false }))
          .replace('{back}', formatUsdc(summary.expectedUsdc, { withSuffix: false }))}
        {summary.needsReview > 0 ? ` · ${t.needsReview.replace('{count}', String(summary.needsReview))}` : ''}
      </p>

      <ul className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
        {visible.map((offer) => {
          const status = offer.status as ShownStatus;
          return (
            <li key={offer.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
                  <span aria-hidden className={cn('size-2 rounded-full', DOT[status])} />
                  {t.status[status]}
                  <span className="font-normal text-[var(--lp-text-sub)]">· {when(offer)}</span>
                </p>
                <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">
                  {status === 'defaulted' && offer.fromGuaranteeMicros
                    ? t.shortfall.replace('{amount}', formatUsdc((Number(offer.fromGuaranteeMicros) / 1e6).toString(), { withSuffix: false }))
                    : t.detail[status]}
                </p>
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
                  <div className="flex gap-1.5">
                    <dt className="text-[var(--lp-text-sub)]">{t.advanced}</dt>
                    <dd className="whitespace-nowrap font-semibold tabular-nums text-[var(--lp-dark)]">
                      {formatUsdc(offer.offeredAdvanceUsdc, { withSuffix: false })} USDC
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-[var(--lp-text-sub)]">{status === 'settled' || status === 'repaid' ? t.received : t.expected}</dt>
                    <dd className="whitespace-nowrap font-semibold tabular-nums text-[var(--lp-dark)]">
                      {formatUsdc(offer.expectedReturnUsdc, { withSuffix: false })} USDC
                    </dd>
                  </div>
                </dl>
              </div>
              {status === 'awaiting_financier' ? (
                <PaySeller offer={offer} onPaid={() => setReload((n) => n + 1)} />
              ) : (
                <Link href={`/financier/factoring/${offer.id}`} className={LINK}>
                  {t.view}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {pageCount > 1 && (
        <nav aria-label={t.pagination} className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14px] tabular-nums text-[var(--lp-text-sub)]">
            {t.range
              .replace('{from}', String(pageStart + 1))
              .replace('{to}', String(Math.min(pageStart + PAGE_SIZE, offers.length)))
              .replace('{total}', String(offers.length))}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className={SECONDARY}>
              {t.previous}
            </button>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className={SECONDARY}>
              {t.next}
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
