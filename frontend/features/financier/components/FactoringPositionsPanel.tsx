'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import Link from 'next/link';
import { api, type FactoringOffer } from '@/core/api';
import { shortAddress } from '@/shared/utils/format';

const STATUS: Record<string, { label: string; tone: string; detail: string }> = {
  accepted: { label: 'Active', tone: 'var(--lp-accent)', detail: 'Awaiting escrow settlement' },
  settled: { label: 'Repaid', tone: 'var(--lp-accent)', detail: 'Position completed successfully' },
  defaulted: { label: 'Needs review', tone: '#a33a32', detail: 'Repayment was not completed' },
};
const PAGE_SIZE = 4;

function dateLabel(offer: FactoringOffer): string {
  const value = offer.settledAt ?? offer.acceptedAt ?? offer.updatedAt ?? offer.offeredAt;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
}

export function FactoringPositionsPanel() {
  const pb = useTranslations().pageBits;
  const [offers, setOffers] = useState<FactoringOffer[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const load = () =>
      api
        .listMyFactoringOffers()
        .then((result) =>
          setOffers(
            result.asFinancier
              .filter((offer) => ['accepted', 'settled', 'defaulted'].includes(offer.status))
              .sort((a, b) => (b.updatedAt ?? b.offeredAt) - (a.updatedAt ?? a.offeredAt)),
          ),
        )
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(offers.length / PAGE_SIZE) - 1);
    setPage((current) => Math.min(current, lastPage));
  }, [offers.length]);

  if (!offers.length) return null;

  const pageCount = Math.ceil(offers.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const visibleOffers = offers.slice(pageStart, pageStart + PAGE_SIZE);
  const pageEnd = Math.min(pageStart + PAGE_SIZE, offers.length);

  return (
    <section className="border-t border-[var(--lp-border-light)] px-5 py-6 sm:px-7">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            Invoice financing
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-[var(--lp-dark)]">{pb.financierPanels.yourPositions}</h2>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {offers.length} {offers.length === 1 ? 'position' : 'positions'}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {visibleOffers.map((offer) => {
          const status = STATUS[offer.status] ?? STATUS.accepted;
          return (
            <article key={offer.id} className="border border-[var(--lp-border-light)] bg-white/45 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className="mono inline-flex px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: status.tone, background: `color-mix(in srgb, ${status.tone} 12%, transparent)` }}
                  >
                    {status.label}
                  </span>
                  <p className="mt-2 text-[12px] text-[var(--lp-text-sub)]">{status.detail}</p>
                </div>
                <p className="shrink-0 text-end text-[18px] font-semibold tabular-nums text-[var(--lp-dark)]">
                  {offer.offeredAdvanceUsdc} USDC
                </p>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--lp-border-light)] pt-3 text-[11px]">
                <div>
                  <dt className="mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">{pb.financierPanels.expectedReturn}</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-[var(--lp-dark)]">{offer.expectedReturnUsdc} USDC</dd>
                </div>
                <div>
                  <dt className="mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">Seller</dt>
                  <dd className="mt-1 font-semibold text-[var(--lp-dark)]">{shortAddress(offer.seller)}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">{dateLabel(offer)}</span>
                <Link
                  href={`/financier/factoring/${offer.id}`}
                  className="mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-dark)] underline underline-offset-4"
                >
                  View position →
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {pageCount > 1 && (
        <nav
          aria-label="Invoice financing positions pagination"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--lp-border-light)] pt-4"
        >
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {pageStart + 1}–{pageEnd} of {offers.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous positions"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-border-light)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              ←
            </button>
            <span className="mono min-w-[3.5rem] text-center text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              aria-label="Next positions"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              className="inline-flex min-h-11 items-center gap-2 bg-[var(--lp-accent)] px-4 text-[var(--lp-dark)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span className="mono text-[10px] font-bold uppercase tracking-[0.14em]">Next</span>
              <span aria-hidden>→</span>
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
