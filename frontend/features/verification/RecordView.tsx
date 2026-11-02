'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/core/api';
import { explorerTxUrl, settlementChain } from '@/core/arcNetwork';
import { reasonLabels } from '@/features/reputation/sealed';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { BackButton } from '@/shared/components/BackButton';
import { ratingText } from '@/features/ratings/ratingText';
import type { RecordFactKind } from '@/shared/i18n/messages/record';
import { publicRecord } from './publicRecord';
import { useTierLabels } from '@/features/reputation/useTierLabels';
import type { CompositeTier } from '@/features/reputation/tierColors';

type RecordData = Awaited<ReturnType<typeof api.record>>;

/// karwan.site/r/<tag>: a person's portable record. Who they are, how they
/// are verified, their score and counts, and the proof on Arc for each fact.
/// Never an amount or who the deals were with.
export function RecordView({ tag }: { tag: string }) {
  const t = useTranslations().record;
  const sealed = useTranslations().sealedRecord;
  const { locale, t: all } = useLocale();
  const [record, setRecord] = useState<RecordData | null>(null);
  const [failure, setFailure] = useState<'missing' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Who the tag belongs to, so your own record never offers to message you.
  const owner = useQuery({ queryKey: ['karwan-tag', tag.toLowerCase()], queryFn: () => api.resolveKarwanTag(tag), staleTime: 60_000 });
  const own = owner.data?.found ? owner.data.self : false;
  const sellerAddress = owner.data?.found ? owner.data.address.toLowerCase() : null;
  const tierNames = useTierLabels();
  const pp = useTranslations().profilePage;
  // What they sell: their open offers on the market (view 44, P10).
  const offers = useQuery({ queryKey: ['market-listings'], queryFn: () => api.listings(), enabled: !!sellerAddress, staleTime: 60_000 });
  const selling = (offers.data?.listings ?? []).filter((l) => l.sellerUser.toLowerCase() === sellerAddress && !l.cancelledAt && l.expiresAt > Date.now()).slice(0, 4);

  useEffect(() => {
    api
      .record(tag)
      .then((r) => {
        setFailure(null);
        setRecord(r);
      })
      .catch((err) => setFailure(err instanceof ApiError && err.status === 404 ? 'missing' : 'error'));
  }, [tag, attempt]);

  if (failure === 'missing') {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-12">
        <p className="text-[16px] text-[var(--lp-ink)]">{t.notFound}</p>
        <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{t.notFoundHint}</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--lp-ink)]">
          {t.home}
        </Link>
      </main>
    );
  }
  if (failure) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-12">
        <p className="text-[16px] text-[var(--lp-text-sub)]">{t.unavailable}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--lp-ink)]"
        >
          {t.retry}
        </button>
      </main>
    );
  }
  if (!record) return <main className="mx-auto w-full max-w-[720px] px-4 py-12" aria-busy="true" />;

  const view = publicRecord(record);
  const reasons = reasonLabels(view.reasons, sealed);
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:py-10">
      <div className="-ms-2 mb-4">
        <BackButton tone="adaptive" showOnPublic fallbackHref="/market" />
      </div>
      <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{all.passport.record}</p>
      <h1 className="mt-1 text-[28px] font-semibold leading-tight text-[var(--lp-ink)]">
        {record.displayName ?? sealed.unnamed}
      </h1>
      {record.tag ? <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">@{record.tag}</p> : null}
      <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.levels[record.level]}</p>
      {record.tag && !own ? (
        <Link href={`/messages/${encodeURIComponent(record.tag)}`} className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-line)] px-5 text-[14px] font-semibold text-[var(--lp-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
          {all.directMessages.messageFromAd.replace('{tag}', `@${record.tag}`)}
        </Link>
      ) : null}

      <dl className="mt-8 border-t border-[var(--lp-line)]">
        <div className="flex justify-between gap-4 border-b border-[var(--lp-line)] py-3">
          <dt className="text-[14px] text-[var(--lp-text-sub)]">{t.tier}</dt>
          <dd className="text-[14px] font-semibold text-[var(--lp-ink)]">{tierNames[view.tier as CompositeTier] ?? view.tier}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-[var(--lp-line)] py-3">
          <dt className="text-[14px] text-[var(--lp-text-sub)]">{all.ratings.label}</dt>
          <dd className="text-[14px] font-semibold tabular-nums text-[var(--lp-ink)]">{ratingText(view.rating, all.ratings, locale)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.meaning}</p>
      {reasons.length ? <p className="mt-4 text-[15px] text-[var(--lp-ink)]">{reasons.join(' · ')}</p> : null}

      {selling.length ? (
        <section className="mt-10" aria-labelledby="record-selling">
          <h2 id="record-selling" className="text-[18px] font-semibold text-[var(--lp-ink)]">{pp.whatTheySell.replace('{name}', record.displayName ?? `@${record.tag}`)}</h2>
          <ul className="mt-3 border-t border-[var(--lp-line)]">
            {selling.map((l) => (
              <li key={l.id} className="border-b border-[var(--lp-line)]">
                <Link href={`/listings/${l.id}`} className="flex min-h-12 items-center justify-between gap-4 py-3 text-[15px] text-[var(--lp-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                  <span dir="auto" className="min-w-0 truncate font-medium">{l.title}</span>
                  <span className="shrink-0 tabular-nums font-semibold">{l.askingPriceUsdc} USDC</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="mt-10 text-[18px] font-semibold text-[var(--lp-ink)]">{t.verifiedFacts}</h2>
      {record.facts.length === 0 ? (
        <p className="mt-3 text-[15px] text-[var(--lp-text-sub)]">{t.noFacts}</p>
      ) : (
        <ul className="mt-3 border-t border-[var(--lp-line)]">
          {record.facts.map((f, i) => (
            <li key={`${f.kind}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--lp-line)] py-3">
              <span className="text-[15px] text-[var(--lp-ink)]">{t.kinds[f.kind as RecordFactKind] ?? f.kind}</span>
              <span className="text-[14px] text-[var(--lp-text-sub)]">
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

      <p className="mt-8 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.privacy}</p>

      <h2 className="mt-10 text-[18px] font-semibold text-[var(--lp-ink)]">{t.sources}</h2>
      <dl className="mt-3 border-t border-[var(--lp-line)]">
        <div className="flex justify-between gap-4 border-b border-[var(--lp-line)] py-3">
          <dt className="text-[15px] text-[var(--lp-ink)]">{t.sourceKarwan}</dt>
          <dd className="text-[14px] font-semibold text-[var(--lp-ink)]">{t.connected}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-[var(--lp-line)] py-3">
          <dt className="text-[15px] text-[var(--lp-ink)]">{t.otherPlatforms}</dt>
          <dd className="text-[14px] text-[var(--lp-text-sub)]">{t.noPartners}</dd>
        </div>
      </dl>

      <a
        href={api.recordCredentialUrl(tag)}
        download={`karwan-record-${tag}.json`}
        className="mt-10 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--lp-ink)]"
      >
        {t.download}
      </a>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.downloadNote}</p>
    </main>
  );
}
