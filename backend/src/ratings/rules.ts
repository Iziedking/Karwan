import { hasContactDetails } from '../messages/direct.js';

/// Rating a settled deal out of 5: who may rate, when ratings show, and the
/// public number. Kept apart from the reputation score, which is untouched.

export interface DealRating {
  dealId: string;
  /// The identity who rated, never an agent address.
  rater: string;
  ratee: string;
  stars: 1 | 2 | 3 | 4 | 5;
  note: string | null;
  /// A note with contact details is kept but never published.
  noteHeld: boolean;
  settledAt: number;
  createdAt: number;
  /// Who lost the deal's dispute, or a split ruling, so the outcome always
  /// travels with the rating. Null when there was no dispute.
  dispute?: 'buyer' | 'seller' | 'split' | null;
}

/// `disputed` is how many of the counted ratings came from a disputed deal,
/// shown beside the number so a dispute is never hidden in the average.
/// `forWork` is the rating for the work asked about (view 93): `value` to one
/// decimal, `count` of deals like this, `rank` unrounded for ordering.
export type PublicRating =
  | { kind: 'new'; count: number }
  | { kind: 'rated'; value: number; count: number; disputed: number; forWork?: { value: number; count: number; rank: number } };

export const REVEAL_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const RATED_FROM = 3;

export function mayRate(
  deal: { buyer: string; seller: string; settledAt: number | null },
  rater: string,
  existing: DealRating[],
): { ok: true; ratee: string } | { ok: false; reason: 'not_party' | 'not_settled' | 'already_rated' } {
  const me = rater.toLowerCase();
  const buyer = deal.buyer.toLowerCase();
  const seller = deal.seller.toLowerCase();
  if (me !== buyer && me !== seller) return { ok: false, reason: 'not_party' };
  if (deal.settledAt === null) return { ok: false, reason: 'not_settled' };
  if (existing.some((r) => r.rater.toLowerCase() === me)) return { ok: false, reason: 'already_rated' };
  return { ok: true, ratee: me === buyer ? seller : buyer };
}

/// A rating shows as soon as it is given; it never waits for the other side.
export function isRevealed(dealRatings: DealRating[], _settledAt: number, _now: number): boolean {
  return dealRatings.length > 0;
}

export function publicRating(revealed: DealRating[]): PublicRating {
  if (revealed.length < RATED_FROM) return { kind: 'new', count: revealed.length };
  const mean = revealed.reduce((sum, r) => sum + r.stars, 0) / revealed.length;
  const disputed = revealed.filter((r) => !!r.dispute).length;
  return { kind: 'rated', value: Math.round(mean * 10) / 10, count: revealed.length, disputed };
}

/// The ratings about someone that may be shown: those on deals whose ratings
/// are revealed. `byDeal` holds every rating of each deal.
export function revealedAbout(about: DealRating[], byDeal: Map<string, DealRating[]>, now: number): DealRating[] {
  return about.filter((r) => isRevealed(byDeal.get(r.dealId) ?? [r], r.settledAt, now));
}

/// How a rating reads in plain English: "4.8 from 23 deals", "4.8 from 3 deals like
/// this · 4.6 overall from 23" (view 93) or "New, 2 ratings so far".
export function ratingLine(r: PublicRating): string {
  const disputed = r.kind === 'rated' && r.disputed > 0 ? `, ${r.disputed} disputed` : '';
  if (r.kind === 'rated' && r.forWork && r.forWork.count >= 1) {
    return `${r.forWork.value.toFixed(1)} from ${r.forWork.count} deals like this · ${r.value.toFixed(1)} overall from ${r.count}${disputed}`;
  }
  if (r.kind === 'rated') return `${r.value.toFixed(1)} from ${r.count} deals${disputed}`;
  return `New, ${r.count} rating${r.count === 1 ? '' : 's'} so far`;
}

export function holdNote(note: string): boolean {
  return hasContactDetails(note);
}
