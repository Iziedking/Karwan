'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { attestedDealsCopy } from '@/shared/i18n/messages/attestedDeals';
import { attestedRows } from '../attestedDeals';

/// The deals Karwan has signed a public statement about, each checkable as a
/// W3C credential. The owner can download all of theirs.
export function AttestedDeals({ address, downloadable = false }: { address: string; downloadable?: boolean }) {
  const { locale } = useLocale();
  const copy = attestedDealsCopy[locale];
  const query = useQuery({
    queryKey: ['attested-deals', address.toLowerCase()],
    queryFn: () => api.attestationsFor(address),
    staleTime: 60_000,
  });
  // A failed lookup shows nothing rather than a wrong "none".
  if (query.isError) return null;
  if (!query.data) return <div aria-hidden className="mt-8 h-[96px] border-t border-[var(--lp-border-light)]" />;
  const rows = attestedRows(query.data.attestations, copy, locale);

  return (
    <section aria-labelledby="attested-deals" className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
      <h2 id="attested-deals" className="text-[17px] font-semibold text-[var(--lp-dark)]">{copy.title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[15px] text-[var(--lp-text-sub)]">{copy.none}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--lp-border-light)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <span className="min-w-0 text-[15px] tabular-nums text-[var(--lp-dark)]">{r.line}</span>
              {r.removed ? (
                <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.removed}</span>
              ) : (
                <a href={r.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
                  {copy.check}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {downloadable && rows.length > 0 ? (
        <a
          href={`/attestations/by-subject/${address.toLowerCase()}.json`}
          download={`karwan-attested-deals-${address.slice(2, 8).toLowerCase()}.json`}
          className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-5 text-[14px] font-semibold text-[var(--lp-dark)]"
        >
          {copy.download}
        </a>
      ) : null}
    </section>
  );
}
