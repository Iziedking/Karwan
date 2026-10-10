'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { explorerTxUrl, settlementChain } from '@/core/arcNetwork';
import { reasonLabels } from '@/features/reputation/sealed';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { RecordFactKind } from '@/shared/i18n/messages/record';

type RecordData = Awaited<ReturnType<typeof api.record>>;

/// karwan.site/r/<tag>: a person's portable record. Who they are, how they
/// are verified, and the proof on Arc for each fact. No numbers.
export function RecordView({ tag }: { tag: string }) {
  const t = useTranslations().record;
  const sealed = useTranslations().sealedRecord;
  const [record, setRecord] = useState<RecordData | null>(null);
  const [failure, setFailure] = useState<'missing' | 'error' | null>(null);

  useEffect(() => {
    api
      .record(tag)
      .then(setRecord)
      .catch((err) => setFailure(err instanceof ApiError && err.status === 404 ? 'missing' : 'error'));
  }, [tag]);

  if (failure) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-12">
        <p className="text-[16px] text-[var(--lp-text-sub)]">{failure === 'missing' ? t.notFound : t.unavailable}</p>
      </main>
    );
  }
  if (!record) return <main className="mx-auto w-full max-w-[720px] px-4 py-12" aria-busy="true" />;

  const reasons = reasonLabels(record.reasons, sealed);
  const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-12 sm:py-16">
      <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.levels[record.level]}</p>
      <h1 className="mt-1 text-[28px] font-semibold leading-tight text-[var(--lp-ink)]">
        {record.displayName ?? sealed.unnamed}
      </h1>
      {record.tag ? <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">@{record.tag}</p> : null}

      <dl className="mt-8 border-t border-[var(--lp-line)]">
        <div className="flex justify-between gap-4 border-b border-[var(--lp-line)] py-3">
          <dt className="text-[14px] text-[var(--lp-text-sub)]">{t.tier}</dt>
          <dd className="text-[14px] font-semibold text-[var(--lp-ink)]">{record.tier}</dd>
        </div>
      </dl>
      {reasons.length ? <p className="mt-4 text-[15px] text-[var(--lp-ink)]">{reasons.join(' · ')}</p> : null}

      <h2 className="mt-10 text-[18px] font-semibold text-[var(--lp-ink)]">{t.verifiedFacts}</h2>
      {record.facts.length === 0 ? (
        <p className="mt-3 text-[15px] text-[var(--lp-text-sub)]">{t.noFacts}</p>
      ) : (
        <ul className="mt-3 border-t border-[var(--lp-line)]">
          {record.facts.map((f, i) => (
            <li key={`${f.kind}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--lp-line)] py-3">
              <span className="text-[15px] text-[var(--lp-ink)]">{t.kinds[f.kind as RecordFactKind] ?? f.kind}</span>
              <span className="text-[13px] text-[var(--lp-text-sub)]">
                {t.until} {date(f.expiresAt)}
                {f.txHash ? (
                  <>
                    {' · '}
                    <a className="underline underline-offset-2" href={explorerTxUrl(settlementChain, f.txHash)} target="_blank" rel="noreferrer">
                      {t.proof}
                    </a>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <a
        href={api.recordCredentialUrl(tag)}
        download={`karwan-record-${tag}.json`}
        className="mt-10 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--lp-ink)]"
      >
        {t.download}
      </a>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{t.downloadNote}</p>
    </main>
  );
}
