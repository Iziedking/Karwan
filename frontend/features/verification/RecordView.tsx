'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/core/api';
import { explorerTxUrl, settlementChain } from '@/core/arcNetwork';
import { reasonLabels } from '@/features/reputation/sealed';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { BackButton } from '@/shared/components/BackButton';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Listing } from '@/core/api';
import { countryName } from '@/features/listings/listingPage';
import { photoSrc, type WithPhotos } from '@/features/listings/photos';
import { listingCategory, samplePhoto } from '@/features/market/listingFacts';
import { ratingText } from '@/features/ratings/ratingText';
import type { RecordFactKind } from '@/shared/i18n/messages/record';
import { publicRecord } from './publicRecord';
import { useTierLabels } from '@/features/reputation/useTierLabels';
import type { CompositeTier } from '@/features/reputation/tierColors';

type RecordData = Awaited<ReturnType<typeof api.record>>;

/// karwan.site/r/<tag>: a person's portable record (view 48). Who they are,
/// three facts in one card, what they sell, the proof on Arc for each fact,
/// and one primary: ask them for an offer. Never an amount or who the deals
/// were with.
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
  const { isAuthenticated } = useAuth();
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
        <p className="text-[16px] text-[var(--ink)]">{t.notFound}</p>
        <p className="mt-2 text-[15px] text-[var(--ink-secondary)]">{t.notFoundHint}</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--ink)]">
          {t.home}
        </Link>
      </main>
    );
  }
  if (failure) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-12">
        <p className="text-[16px] text-[var(--ink-secondary)]">{t.unavailable}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--ink)]"
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
  const name = record.displayName ?? sealed.unnamed;
  const firstName = record.displayName?.trim().split(/\s+/)[0] || (record.tag ? `@${record.tag}` : name);
  const country = countryName(record.country, locale);
  const rated = view.rating.kind === 'rated' ? view.rating : null;
  // Three facts others may see (view 48): the rating, how many rated it, and the level. Never a count of deals or an amount.
  const facts: Array<[string, string]> = [
    [rated ? rated.value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : t.newRating, t.averageRating],
    [view.rating.count.toLocaleString(locale), view.rating.count === 1 ? t.ratingsOne : t.ratingsMany],
    [tierNames[view.tier as CompositeTier] ?? view.tier, t.tier],
  ];
  const askHref = sellerAddress && !own ? `/buyer?seller=${sellerAddress}` : null;

  return (
    <main className="product-surface mx-auto w-full max-w-[720px] px-4 pb-10 pt-6 sm:py-10">
      <div className="-ms-2 mb-4">
        <BackButton tone="adaptive" showOnPublic fallbackHref="/market" />
      </div>
      <header className="flex items-center gap-4">
        {sellerAddress ? <PersonAvatar address={sellerAddress} name={name} size={72} /> : null}
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{name}</h1>
          <p className="mt-0.5 truncate text-[14px] text-[var(--ink-secondary)]">{[record.tag ? `@${record.tag}` : null, country].filter(Boolean).join(' · ')}</p>
          <p className="mt-0.5 text-[14px] text-[var(--ink-muted)]">{t.levels[record.level]}</p>
        </div>
      </header>

      <dl data-record-facts className={`${CARD_CLASS} mt-5 grid grid-cols-3 divide-x divide-[var(--line)] py-4 rtl:divide-x-reverse`}>
        {facts.map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse items-center gap-0.5 px-2 text-center">
            <dt className="text-[14px] text-[var(--ink-secondary)]">{label}</dt>
            <dd className="text-[18px] font-semibold leading-tight tabular-nums tracking-[-0.01em] text-[var(--ink)] [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      {reasons.length ? <p className="mt-3 text-[14px] text-[var(--ink)]">{reasons.join(' · ')}</p> : null}

      {selling.length ? (
        <section className="mt-8" aria-labelledby="record-selling">
          <h2 id="record-selling" className="text-[17px] font-semibold text-[var(--ink)]">{pp.whatTheySell.replace('{name}', firstName)}</h2>
          <ul className={`${CARD_CLASS} mt-3 divide-y divide-[var(--line)] px-4`}>
            {selling.map((l) => (
              <li key={l.id}>
                <Link href={`/listings/${l.id}`} className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={offerPicture(l)} alt="" loading="lazy" className="size-12 shrink-0 rounded-[10px] bg-[var(--raised)] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-[15px] font-medium text-[var(--ink)]">{l.title}</span>
                    <span className="block text-[14px] tabular-nums text-[var(--ink-secondary)]">{l.askingPriceUsdc} USDC</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="record-facts">
        <h2 id="record-facts" className="text-[17px] font-semibold text-[var(--ink)]">{t.verifiedFacts}</h2>
        {record.facts.length === 0 ? (
          <p className="mt-3 text-[15px] text-[var(--ink-secondary)]">{t.noFacts}</p>
        ) : (
          <ul className={`${CARD_CLASS} mt-3 divide-y divide-[var(--line)] px-4`}>
            {record.facts.map((f, i) => (
              <li key={`${f.kind}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="text-[15px] text-[var(--ink)]">{t.kinds[f.kind as RecordFactKind] ?? f.kind}</span>
                <span className="text-[14px] text-[var(--ink-secondary)]">
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
      </section>

      <section className="mt-8" aria-labelledby="record-sources">
        <h2 id="record-sources" className="text-[17px] font-semibold text-[var(--ink)]">{t.sources}</h2>
        <dl className={`${CARD_CLASS} mt-3 divide-y divide-[var(--line)] px-4`}>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[15px] text-[var(--ink)]">{t.sourceKarwan}</dt>
            <dd className="text-[14px] font-semibold text-[var(--ink)]">{t.connected}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[15px] text-[var(--ink)]">{t.otherPlatforms}</dt>
            <dd className="text-[14px] text-[var(--ink-secondary)]">{t.noPartners}</dd>
          </div>
        </dl>
      </section>

      <p className="mt-6 text-[14px] leading-relaxed text-[var(--ink-secondary)]">{t.meaning}</p>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-secondary)]">{t.privacy}</p>

      <a href={api.recordCredentialUrl(tag)} download={`karwan-record-${tag}.json`} className={`mt-6 ${buttonClasses({ variant: 'secondary' })}`}>
        {t.download}
      </a>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)]">{t.downloadNote}</p>

      {askHref || (record.tag && !own) ? (
        <div data-record-actions className={`sticky z-20 -mx-4 mt-8 border-t border-[var(--line)] bg-[var(--canvas)] px-4 py-3 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 ${isAuthenticated ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {askHref ? <Link href={askHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>{t.askForOffer.replace('{name}', firstName)}</Link> : null}
            {record.tag && !own ? (
              <Link href={`/messages/${encodeURIComponent(record.tag)}`} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
                {all.directMessages.messageFromAd.replace('{tag}', `@${record.tag}`)}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

/// The offer's own first photo, else the sample for its kind.
function offerPicture(listing: Listing): string {
  const own = (listing as Listing & WithPhotos).photoUrls?.[0];
  return own ? photoSrc(own) : samplePhoto(listingCategory(listing));
}
