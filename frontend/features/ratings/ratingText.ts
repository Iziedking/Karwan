import type { RatingsCopy } from '../../shared/i18n/messages/ratings';

export type PublicRating = { kind: 'new'; count: number } | { kind: 'rated'; value: number; count: number; disputed?: number };

/// The public rating in the reader's language: "4.8 from 23 deals", or New
/// under three ratings.
export function ratingText(r: PublicRating, t: RatingsCopy, locale: string): string {
  if (r.kind === 'rated') {
    const value = r.value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const line = t.rated.replace('{value}', value).replace('{count}', r.count.toLocaleString(locale));
    return r.disputed ? line + t.disputed.replace('{n}', r.disputed.toLocaleString(locale)) : line;
  }
  if (r.count === 0) return t.newNone;
  if (r.count === 1) return t.newOne;
  return t.newSome.replace('{count}', r.count.toLocaleString(locale));
}
