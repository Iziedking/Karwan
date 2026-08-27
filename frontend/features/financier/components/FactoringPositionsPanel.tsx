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

function dateLabel(offer: FactoringOffer): string {
  const value = offer.settledAt ?? offer.acceptedAt ?? offer.updatedAt ?? offer.offeredAt;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
}

export function FactoringPositionsPanel() {
  const pb = useTranslations().pageBits;
  const [offers, setOffers] = useState<FactoringOffer[]>([]);

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

  if (!offers.length) return null;

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
        {offers.map((offer) => {
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
    </section>
  );
}
