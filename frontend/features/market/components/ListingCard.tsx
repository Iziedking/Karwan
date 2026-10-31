'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DiscoveryCard } from '@/features/discovery/model';
import { photoSrc } from '@/features/listings/photos';
import { ratingText } from '@/features/ratings/ratingText';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { CATEGORY_ICON, deliveryLine, samplePhoto, sellerLine } from '../listingFacts';

type Picture = 'own' | 'sample' | 'tile';

/// One offer in the market (view 44, Figma Listing card): the photo, Protected,
/// the price as the loudest line, what it is, who sells it with their rating,
/// and how fast it comes. The whole card is one link.
export function ListingCard({ card }: { card: DiscoveryCard }) {
  const { locale, t: messages } = useLocale();
  const t = messages.marketShop;
  const [picture, setPicture] = useState<Picture>(card.photo ? 'own' : 'sample');
  const src = picture === 'own' && card.photo ? photoSrc(card.photo) : samplePhoto(card.category);
  const delivery = deliveryLine(card.deliveryKind, card.readyInDays, t);
  const rating = ratingText(card.seller?.rating ?? { kind: 'new', count: 0 }, messages.ratings, locale);

  return (
    <Link
      href={card.href}
      data-listing-card
      className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] transition-colors hover:border-[color-mix(in_srgb,var(--lp-accent)_45%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-[var(--color-surface-2)]">
        {picture === 'tile' ? (
          <span data-category-tile className="grid size-full place-items-center text-[var(--lp-text-sub)]">
            <Icon name={card.category ? CATEGORY_ICON[card.category] : 'package'} size={24} />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setPicture((now) => (now === 'own' ? 'sample' : 'tile'))}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        )}
        <span className="absolute start-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[var(--lp-card)] px-2.5 py-1 text-[13px] font-semibold text-[var(--lp-accent-on-light)]">
          <Icon name="shield-check" size={16} />
          {t.protected}
        </span>
        {picture === 'sample' && !card.example ? (
          <span className="absolute bottom-2.5 end-2.5 rounded-full bg-[color-mix(in_srgb,var(--lp-band-dark)_72%,transparent)] px-2 py-0.5 text-[13px] font-medium text-[var(--color-white)]">
            {t.samplePhoto}
          </span>
        ) : null}
      </span>
      <span className="flex flex-1 flex-col p-4">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1">
            <span className="text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]">{formatUsdc(card.priceUsdc, { withSuffix: false })}</span>
            <span className="text-[13px] font-semibold text-[var(--ink-secondary)]">{t.usdc}</span>
          </span>
          {card.example || card.partyKind === 'business' ? (
            <span className="shrink-0 rounded-full border border-[var(--lp-border-light)] px-2 py-0.5 text-[13px] font-semibold text-[var(--ink-secondary)]">
              {card.example ? t.example : t.business}
            </span>
          ) : null}
        </span>
        <span dir="auto" className="mt-2 line-clamp-2 h-[42px] text-[15px] font-medium leading-[21px] text-[var(--ink)]">{card.title}</span>
        <span className="mt-3 flex min-w-0 items-center gap-1 text-[14px] font-semibold text-[var(--ink)]">
          <span dir="auto" className="truncate">{sellerLine(card.seller, t)}</span>
          {card.seller?.verified ? (
            <span className="shrink-0 text-[var(--lp-accent-on-light)]" role="img" aria-label={t.verified}>
              <Icon name="badge-check" size={16} />
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-[14px] text-[var(--ink-secondary)]">{rating}</span>
        {delivery ? <span className="mt-auto block truncate pt-0.5 text-[14px] text-[var(--ink-secondary)]">{delivery}</span> : null}
      </span>
    </Link>
  );
}
