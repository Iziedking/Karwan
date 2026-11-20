'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { BackButton } from '@/shared/components/BackButton';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { dealRecordCopy } from '@/shared/i18n/messages/dealRecord';
import { formatDealDate } from '../workspace/presentation';
import { recordRows } from './recordRows';
import { RecordRowsList } from './RecordRowsList';

/// The record a shared link opens (view 94, Figma 382:645), for anyone, signed
/// in or not: the two sides by name and Karwan tag, never a wallet address, the
/// same five rows read-only, and whether Karwan's signature checks out.
export function SharedDealRecordPage({ token }: { token: string }) {
  const { locale } = useLocale();
  const t = dealRecordCopy[locale];
  const query = useQuery({ queryKey: ['shared-deal-record', token], queryFn: () => api.sharedDealRecord(token), retry: false, staleTime: 60_000 });
  const doc = query.data;

  return (
    <article data-shared-record className="mx-auto max-w-[640px] px-4 py-6 sm:py-10">
      <div data-own-back className="mb-4">
        <BackButton tone="adaptive" showOnPublic fallbackHref="/market" />
      </div>
      <h1 className="text-[26px] font-semibold text-[var(--lp-dark)]">{t.title}</h1>
      {query.isError ? (
        <p className="mt-4 text-[15px] text-[var(--lp-text-sub)]">{t.notFound}</p>
      ) : !doc ? (
        <div aria-busy className="mt-8 h-[320px] rounded-[24px] bg-[var(--lp-card)]" />
      ) : (
        <>
          <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">
            {doc.record.reference} · {doc.sharedBy === 'seller' ? t.sharedBySeller : t.sharedByBuyer}
          </p>
          <dl className="mt-5 divide-y divide-[var(--lp-border-light)] rounded-[20px] bg-[var(--lp-card)] px-5">
            {(['buyer', 'seller'] as const).map((side) => {
              const who = doc[side];
              return (
                <div key={side} data-side={side} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-[14px] font-medium text-[var(--lp-text-sub)]">{side === 'buyer' ? t.buyer : t.seller}</dt>
                  <dd className="min-w-0 text-end">
                    <span dir="auto" className="text-[15px] font-semibold text-[var(--lp-dark)]">{who.name ?? (who.tag ? `@${who.tag}` : t.notRecorded)}</span>
                    {who.name && who.tag ? <span className="ms-1.5 text-[14px] text-[var(--lp-text-sub)]">@{who.tag}</span> : null}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="mt-4 rounded-[24px] bg-[var(--lp-card)] p-5">
            <RecordRowsList rows={recordRows(doc.record, null, doc.writtenAt, t, (ms) => formatDealDate(ms, locale))} t={t} />
          </div>
          <p
            data-signature
            className={doc.signedByKarwan
              ? 'mt-4 flex items-start gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--lp-accent)_24%,transparent)] px-3.5 py-3 text-[14px] font-medium text-[var(--lp-dark)]'
              : 'mt-4 flex items-start gap-2 rounded-[14px] border border-[var(--color-critical)] px-3.5 py-3 text-[14px] font-medium text-[var(--lp-dark)]'}
          >
            <Icon name={doc.signedByKarwan ? 'shield-check' : 'alert'} size={16} className="mt-px shrink-0" />
            <span>{doc.signedByKarwan ? t.signatureHolds : t.signatureFails}</span>
          </p>
        </>
      )}
    </article>
  );
}
