import { ratingsAbout, ratingsForDeal } from '../db/ratings.js';
import { publicRating, revealedAbout, type DealRating, type PublicRating } from './rules.js';

/// Someone's public rating: the mean of the revealed ratings about them.
export async function loadPublicRating(address: string, now = Date.now()): Promise<PublicRating> {
  const about = await ratingsAbout(address).catch(() => [] as DealRating[]);
  if (about.length === 0) return { kind: 'new', count: 0 };
  const byDeal = new Map<string, DealRating[]>();
  await Promise.all(
    [...new Set(about.map((r) => r.dealId))].map(async (id) => byDeal.set(id, await ratingsForDeal(id).catch(() => []))),
  );
  return publicRating(revealedAbout(about, byDeal, now));
}
