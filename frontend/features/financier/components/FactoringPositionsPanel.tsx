'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DirectDeal, type FactoringOffer } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { LINK, SECONDARY } from '@/shared/ui/controls';
import { stageOf } from '@/features/deals/components/DirectDealList';
import { dealReference } from '@/features/deals/dealReference';
import { financedStage } from '@/features/notifications/openDealsModel';
import { groupPositions, positionsSummary } from '../deskModel';
import { PaySeller } from './PaySeller';

const SHOWN = ['awaiting_financier', 'accepted', 'settled', 'repaid', 'defaulted', 'waived'] as const;
type ShownStatus = (typeof SHOWN)[number];
const PAGE_SIZE = 4;
const POSITIONS_KEY = ['financier', 'positions'] as const;

const DOT: Record<ShownStatus, string> = {
  awaiting_financier: 'bg-[var(--warn)]',
  accepted: 'bg-[var(--lp-accent)]',
  settled: 'bg-[var(--color-positive)]',
  repaid: 'bg-[var(--color-positive)]',
  defaulted: 'bg-[var(--color-critical)]',
  waived: 'bg-[var(--lp-border-light)]',
};

/// The financier's own positions, read once and shared by the open part at the
/// top of the desk and the history at the bottom.
function usePositions() {
  const query = useQuery({
    queryKey: POSITIONS_KEY,
    queryFn: () =>
      api
        .listMyFactoringOffers()
        .then((result) => result.asFinancier.filter((offer) => (SHOWN as readonly string[]).includes(offer.status))),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  return query.data ?? [];
}

/// What is waiting on the financier and the money they have out, first on the
/// desk. Finished positions are in FactoringHistoryPanel, below the requests.
export function FactoringPositionsPanel() {
  const t = useTranslations().financierDashboard.positions;
  const offers = usePositions();
  const queryClient = useQueryClient();
  const { needsYou, active } = groupPositions(offers);
  const open = [...needsYou, ...active];
  // The deal behind each open position, for where it stands and who the seller is.
  const deals = useQueries({
    queries: open.map((offer) => ({
      queryKey: ['financier', 'position', offer.id],
      queryFn: () => api.factoringPosition(offer.id).then((r) => r.deal),
      staleTime: 30_000,
    })),
  });
  const dealOf = new Map(open.map((offer, i) => [offer.id, deals[i]?.data ?? null]));

  if (!offers.length) return null;

  const summary = positionsSummary(offers);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: POSITIONS_KEY });

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
        {needsYou.length > 0 ? ` · ${t.needsReview.replace('{count}', String(needsYou.length))}` : ''}
      </p>

      {needsYou.length > 0 && (
        <PositionGroup id="positions-needs-you" title={t.needsYouTitle}>
          {needsYou.map((offer) => (
            <PositionRow key={offer.id} offer={offer} deal={dealOf.get(offer.id) ?? null} onPaid={refresh} />
          ))}
        </PositionGroup>
      )}
      {active.length > 0 && (
        <PositionGroup id="positions-active" title={t.activeTitle}>
          {active.map((offer) => (
            <PositionRow key={offer.id} offer={offer} deal={dealOf.get(offer.id) ?? null} onPaid={refresh} />
          ))}
        </PositionGroup>
      )}
    </section>
  );
}

/// Repaid and closed positions, newest first, a page at a time.
export function FactoringHistoryPanel() {
  const t = useTranslations().financierDashboard.positions;
  const { history } = groupPositions(usePositions());
  const [page, setPage] = useState(0);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(history.length / PAGE_SIZE) - 1);
    setPage((current) => Math.min(current, lastPage));
  }, [history.length]);

  if (!history.length) return null;

  const pageCount = Math.ceil(history.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const visible = history.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section aria-labelledby="positions-history" className="pt-10">
      <h2 id="positions-history" className="text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em] text-[var(--lp-dark)]">
        {t.historyTitle}
      </h2>
      <ul className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
        {visible.map((offer) => (
          <PositionRow key={offer.id} offer={offer} deal={null} onPaid={() => {}} />
        ))}
      </ul>
      {pageCount > 1 && (
        <nav aria-label={t.pagination} className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14px] tabular-nums text-[var(--lp-text-sub)]">
            {t.range
              .replace('{from}', String(pageStart + 1))
              .replace('{to}', String(Math.min(pageStart + PAGE_SIZE, history.length)))
              .replace('{total}', String(history.length))}
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

function PositionGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="mt-6" role="group" aria-labelledby={id}>
      <h3 id={id} className="text-[16px] font-semibold text-[var(--lp-dark)]">{title}</h3>
      <ul className="mt-2 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">{children}</ul>
    </div>
  );
}

function PositionRow({ offer, deal, onPaid }: { offer: FactoringOffer; deal: DirectDeal | null; onPaid: () => void }) {
  const copy = useTranslations();
  const t = copy.financierDashboard.positions;
  const stages = copy.pending.financed.stages;
  const { locale } = useLocale();
  const status = offer.status as ShownStatus;
  const reference = dealReference(offer.invoiceId);
  const seller = deal?.sellerPaytag ? `@${deal.sellerPaytag}` : deal?.counterpartyCompany?.name?.trim() || copy.financierDashboard.open.anySeller;
  const when = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    offer.settledAt ?? offer.acceptedAt ?? offer.updatedAt ?? offer.offeredAt,
  );
  // A live position says where its deal stands; a finished one says when it ended.
  const aside = status === 'accepted' && deal ? stages[financedStage(stageOf(deal), deal.deadlineUnix)] : when;
  const finished = status === 'settled' || status === 'repaid';

  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
          <span aria-hidden className={cn('size-2 rounded-full', DOT[status])} />
          {t.status[status]}
          <span className="font-normal text-[var(--lp-text-sub)]">· {aside}</span>
        </p>
        {reference ? (
          <p dir="auto" className="mt-0.5 truncate text-[14px] text-[var(--lp-text-sub)]">
            {t.dealLine.replace('{reference}', reference).replace('{seller}', seller)}
          </p>
        ) : null}
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
            <dt className="text-[var(--lp-text-sub)]">{finished ? t.received : t.expected}</dt>
            <dd className="whitespace-nowrap font-semibold tabular-nums text-[var(--lp-dark)]">
              {formatUsdc(offer.expectedReturnUsdc, { withSuffix: false })} USDC
            </dd>
          </div>
        </dl>
      </div>
      {status === 'awaiting_financier' ? (
        <PaySeller offer={offer} onPaid={onPaid} />
      ) : (
        <Link href={`/financier/factoring/${offer.id}`} className={LINK}>
          {t.view}
        </Link>
      )}
    </li>
  );
}
