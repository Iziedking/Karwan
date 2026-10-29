'use client';

import Link from 'next/link';
import type { RankedWorkOffer } from '@/core/api';
import { ratingText } from '@/features/ratings/ratingText';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';

/// Who someone is, as everyone but themselves sees them (UI law rule 3): name
/// and tag, verified in words, tier, rating and up to three reasons. Never a
/// score, a count, an amount or who they dealt with.
export function SellerBlock({ offer }: { offer: Pick<RankedWorkOffer, 'seller' | 'name' | 'tag' | 'verified' | 'tier' | 'rating' | 'reasons' | 'recommended'> }) {
  const copy = useTranslations().shortlist;
  const { locale, t: all } = useLocale();
  const tier = copy.tiers[offer.tier as keyof typeof copy.tiers] ?? offer.tier;
  const reasons = offer.reasons.map((r) => copy.reasons[r as keyof typeof copy.reasons]).filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-0 items-start gap-3">
      <PersonAvatar address={offer.seller} name={offer.name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span dir="auto" className="truncate text-[15px] font-semibold text-[var(--lp-dark)]">{offer.name}</span>
          {offer.tag ? <Link href={`/r/${offer.tag}`} className="text-[14px] font-medium text-[var(--ink-secondary)] underline-offset-2 hover:underline">@{offer.tag}</Link> : null}
        </p>
        <p className={`mt-0.5 text-[14px] font-semibold ${offer.verified ? 'text-[var(--color-positive)]' : 'text-[var(--lp-dark)]'}`}>
          {`${offer.verified ? copy.verified : copy.notVerified} · ${tier}`}
        </p>
        <p className="mt-0.5 text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{ratingText(offer.rating, all.ratings, locale)}</p>
        {offer.recommended ? <p className="mt-1 text-[14px] font-semibold text-[var(--lp-dark)]">{copy.recommended}</p> : null}
        {reasons ? <p className="mt-0.5 text-[14px] font-medium text-[var(--ink-secondary)]">{reasons}</p> : null}
      </div>
    </div>
  );
}
