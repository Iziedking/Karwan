'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { BackButton } from '@/shared/components/BackButton';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { attestedDealsCopy } from '@/shared/i18n/messages/attestedDeals';

export function AttestedDealPage({ id }: { id: string }) {
  const { locale } = useLocale();
  const copy = attestedDealsCopy[locale];
  const query = useQuery({ queryKey: ['attested-deal', id], queryFn: () => api.attestation(id), staleTime: 60_000, retry: 1 });
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const doc = query.data;
  // People are known by their name and Karwan tag, never by a wallet address.
  const subject = useQuery({
    queryKey: ['attested-subject', doc?.subject.address],
    queryFn: () => api.getProfile(doc!.subject.address),
    enabled: !!doc,
    staleTime: 60_000,
  });
  const person = subject.data?.profile;
  const who = person?.handle ? [person.displayName?.trim(), `@${person.handle}`].filter(Boolean).join(' · ') : null;

  const rows = doc
    ? [
        ...(who ? [[copy.whoLabel, who]] : []),
        [copy.settledOn, date.format(new Date(doc.claim.settledAt))],
        [copy.roleLabel, doc.claim.role === 'buyer' ? copy.buyer : copy.seller],
        [copy.valueLabel, copy.bands[doc.claim.amountBand] ?? doc.claim.amountBand],
        ...(doc.claim.viaDispute ? [[copy.disputeLabel, copy.yes]] : []),
        [copy.signedOn, date.format(new Date(doc.issuedAt))],
      ]
    : [];

  return (
    <article className="mx-auto max-w-[720px] px-4 py-6 sm:py-10">
      <div className="-ms-2 mb-4">
        <BackButton tone="adaptive" showOnPublic fallbackHref="/market" />
      </div>
      <h1 className="text-[28px] font-semibold text-[var(--lp-dark)]">{copy.pageTitle}</h1>
      {query.isError ? (
        <p className="mt-6 text-[15px] text-[var(--lp-text-sub)]">{copy.notFound}</p>
      ) : !doc ? (
        <div aria-busy className="mt-8 h-[240px] border-t border-[var(--lp-border-light)]" />
      ) : (
        <>
          <dl className="mt-6 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <dt className="text-[15px] text-[var(--lp-text-sub)]">{label}</dt>
                <dd className="min-w-0 break-all text-end text-[15px] tabular-nums text-[var(--lp-dark)]">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[15px] text-[var(--lp-dark)]">
            {doc.revokedAt ? copy.withdrawn.replace('{date}', date.format(new Date(doc.revokedAt))) : copy.stands}
          </p>
          {/* What a checker needs sits behind Proof, like everywhere else. */}
          <details className="mt-4 border-t border-[var(--lp-border-light)] pt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-[14px] font-semibold text-[var(--lp-dark)]">{copy.proofLabel}</summary>
            <dl className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <dt className="text-[14px] text-[var(--lp-text-sub)]">{copy.signedBy}</dt>
              <dd dir="ltr" className="min-w-0 break-all text-end text-[14px] tabular-nums text-[var(--lp-dark)]">{doc.issuer.address}</dd>
            </dl>
            <a
              href={`/attestations/${encodeURIComponent(id)}/vc`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4"
            >
              {copy.openCredential}
            </a>
          </details>
        </>
      )}
    </article>
  );
}
