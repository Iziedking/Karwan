'use client';

import { Price, PriceIn, PriceRange } from '@/features/money/components/Price';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Listing } from '@/core/api';
import type { DiscoveryCard } from '@/features/discovery/model';
import { liveOffers } from '@/features/home/tradeHub';
import { photoSrc } from '@/features/listings/photos';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { CARD_CLASS } from '@/shared/components/Card';
import { listingCategory, samplePhoto } from '../listingFacts';
import { marketViewHref } from '../marketQuery';

/// One buyer's request on the Sell side (owner notes, 3 Nov 2026), drawn like
/// an offer on Buy: a picture, what they need, the most they pay, by when, and
/// who asks with how many offers so far. A request has no photo of its own, so
/// the picture is a sample for its category and says so.
export function RequestCard({ card, fits }: { card: DiscoveryCard; fits: boolean }) {
  const { locale, t: messages } = useLocale();
  const t = messages.marketShop;
  const by = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(card.availableUntil));
  const n = card.bidsCount;
  const offers = !n ? t.offersNone : n === 1 ? t.offersOne : t.offersMany.replace('{n}', String(n));

  return (
    <Link
      href={card.href}
      data-request-row
      data-fits={fits || undefined}
      className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-[var(--raised)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={samplePhoto(card.category, card.id, card.deliveryKind)} alt="" loading="lazy" className="size-full object-cover" />
        {card.requestState === 'negotiating' || card.requestState === 'agreed' ? (
          <span data-request-state={card.requestState} className="absolute start-2.5 top-2.5 rounded-full bg-[var(--ink)] px-2.5 py-1 text-[13px] font-semibold text-[var(--canvas)]">{t.requestStates[card.requestState]}</span>
        ) : fits ? (
          <span className="absolute start-2.5 top-2.5 rounded-full bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)] px-2.5 py-1 text-[13px] font-semibold text-[var(--ink)]">{t.fits}</span>
        ) : null}
        {card.example ? (
          <span className="absolute end-2.5 top-2.5 rounded-full bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)] px-2.5 py-1 text-[13px] font-semibold text-[var(--ink-secondary)]">{t.example}</span>
        ) : (
          <span className="absolute bottom-2.5 end-2.5 rounded-full bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-2 py-0.5 text-[13px] font-medium text-[var(--ink)]">{t.samplePhoto}</span>
        )}
      </span>
      <span className="flex flex-1 flex-col p-4">
        <span dir="auto" className="line-clamp-2 text-[15px] font-medium leading-[21px] text-[var(--ink)]">{card.title}</span>
        {card.priceRange ? (
          <PriceRange template={t.budgetRange} low={card.priceRange.lowUsdc} high={card.priceRange.highUsdc} className="mt-2 text-[15px] font-semibold text-[var(--ink)]" />
        ) : (
          <PriceIn template={t.upTo} usdc={card.priceUsdc} className="mt-2 text-[15px] font-semibold text-[var(--ink)]" />
        )}
        <span className="mt-1 block truncate text-[13px] text-[var(--ink-secondary)]">{t.neededBy.replace('{date}', by)}</span>
        <span dir="auto" className="mt-0.5 block truncate text-[13px] text-[var(--ink-secondary)]">{[card.seller?.name || (card.seller?.tag ? `@${card.seller.tag}` : null), offers].filter(Boolean).join(' · ')}</span>
      </span>
    </Link>
  );
}

/// Your own offers at the top of the Sell side, with their pictures, so what
/// you listed is in sight and not one link away.
export function YourOffersStrip() {
  const { t: messages } = useLocale();
  const t = messages.marketShop;
  const me = useAuth().address?.toLowerCase() ?? '';
  const listings = useQuery({ queryKey: ['trade-hub', 'listings', me], queryFn: () => api.listingsForSeller(me).then((r) => r.listings), enabled: !!me, staleTime: 15_000 });
  const live = liveOffers(listings.data ?? [], Date.now());
  if (!me) return null;
  if (live.length === 0) {
    return (
      <Link href={marketViewHref('yours', 'offers')} className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]">
        {t.yourOffers}
      </Link>
    );
  }

  return (
    <section aria-labelledby="market-your-offers" data-your-offers className={`${CARD_CLASS} mt-4 p-5 lg:p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="market-your-offers" className="text-[15px] font-semibold text-[var(--ink)]">{t.yourOffers}</h2>
          <p className="mt-0.5 text-[13px] text-[var(--ink-secondary)]">{live.length === 1 ? t.offersLiveOne : t.offersLiveMany.replace('{n}', String(live.length))}</p>
        </div>
        <Link href={marketViewHref('yours', 'offers')} className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-medium text-[var(--ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]">
          {t.seeAll}
        </Link>
      </div>
      <ul className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
        {live.slice(0, 8).map((listing) => <li key={listing.id} className="w-[112px] shrink-0"><OwnOffer listing={listing} /></li>)}
      </ul>
    </section>
  );
}

function OwnOffer({ listing }: { listing: Listing }) {
  const own = (listing as Listing & { photoUrls?: string[] }).photoUrls?.[0];
  const [failed, setFailed] = useState<string | null>(null);
  const src = own && failed !== own ? photoSrc(own) : samplePhoto(listingCategory(listing), listing.id, listing.deliveryKind, listing.examplePhoto);
  return (
    <Link href={`/listings/${listing.id}`} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" onError={() => own && setFailed(own)} className="aspect-[4/3] w-full rounded-[10px] bg-[var(--raised)] object-cover" />
      <span dir="auto" className="mt-1.5 block truncate text-[13px] font-medium text-[var(--ink)]">{listing.title}</span>
      <Price usdc={Number(listing.askingPriceUsdc)} agreed={listing.askingLocal} className="text-[13px] text-[var(--ink-secondary)]" />
    </Link>
  );
}
