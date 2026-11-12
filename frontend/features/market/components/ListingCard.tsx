'use client';

import { Price } from '@/features/money/components/Price';
import Link from 'next/link';
import { useState } from 'react';
import type { DiscoveryCard } from '@/features/discovery/model';
import { photoSrc } from '@/features/listings/photos';
import { ratingText } from '@/features/ratings/ratingText';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { CATEGORY_ICON, cardPicture, samplePhoto, sellerLine } from '../listingFacts';

type Picture = 'own' | 'sample' | 'tile';

/// One offer in the market (view 48, Figma Market): the photo, what it is, the
/// price, then who sells it with their rating. The whole card is one link.
export function ListingCard({ card }: { card: DiscoveryCard }) {
  const { locale, t: messages } = useLocale();
  const t = messages.marketShop;
  const [failed, setFailed] = useState<{ own: string | null; sample: boolean }>({ own: null, sample: false });
  const picture: Picture = cardPicture(card.photo, failed);
  const src = picture === 'own' && card.photo ? photoSrc(card.photo) : samplePhoto(card.category, card.id, card.deliveryKind, card.examplePhoto, card.title);
  const rating = ratingText(card.seller?.rating ?? { kind: 'new', count: 0 }, messages.ratings, locale);

  return (
    <Link
      href={card.href}
      data-listing-card
      className="group flex h-full flex-col rounded-[var(--radius-card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)]"
    >
      <span className="relative block aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-[var(--raised)]">
        {picture === 'tile' ? (
          <span data-category-tile className="grid size-full place-items-center text-[var(--ink-secondary)]">
            <Icon name={card.category ? CATEGORY_ICON[card.category] : 'package'} size={24} />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailed((now) => (picture === 'own' ? { ...now, own: card.photo ?? null } : { ...now, sample: true }))}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        )}
        {picture === 'sample' && !card.example ? (
          <span className="absolute bottom-2 end-2 rounded-full bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)] px-2 py-0.5 text-[13px] font-medium text-[var(--ink)]">
            {t.samplePhoto}
          </span>
        ) : null}
        {card.example || card.partyKind === 'business' ? (
          <span className="absolute start-2 top-2 rounded-full bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)] px-2 py-0.5 text-[13px] font-medium text-[var(--ink)]">
            {card.example ? t.example : t.business}
          </span>
        ) : null}
      </span>
      <span dir="auto" className="mt-3 line-clamp-2 text-[15px] font-medium leading-[1.4] text-[var(--ink)]">{card.title}</span>
      <Price usdc={card.priceUsdc} className="mt-1 text-[15px] font-semibold text-[var(--ink)]" />
      <span className="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-[var(--ink-secondary)]">
        <span dir="auto" className="truncate">{sellerLine(card.seller, t, card.category)}</span>
        {card.seller?.verified ? (
          <span className="shrink-0 text-[var(--ink)]" role="img" aria-label={t.verified}>
            <Icon name="badge-check" size={16} />
          </span>
        ) : null}
        <span aria-hidden className="shrink-0">·</span>
        <span className="truncate">{rating}</span>
      </span>
    </Link>
  );
}
