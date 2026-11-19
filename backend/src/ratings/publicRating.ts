import { listDealsForAddress } from '../db/deals.js';
import { ratingsAbout, ratingsForDeal } from '../db/ratings.js';
import { ratingForWork } from './forWork.js';
import { publicRating, revealedAbout, type DealRating, type PublicRating } from './rules.js';

async function revealedFor(address: string, now: number): Promise<DealRating[]> {
  const about = await ratingsAbout(address).catch(() => [] as DealRating[]);
  if (about.length === 0) return [];
  const byDeal = new Map<string, DealRating[]>();
  await Promise.all(
    [...new Set(about.map((r) => r.dealId))].map(async (id) => byDeal.set(id, await ratingsForDeal(id).catch(() => []))),
  );
  return revealedAbout(about, byDeal, now);
}

/// Someone's public rating: the mean of the revealed ratings about them.
export async function loadPublicRating(address: string, now = Date.now()): Promise<PublicRating> {
  const revealed = await revealedFor(address, now);
  return revealed.length === 0 ? { kind: 'new', count: 0 } : publicRating(revealed);
}

type Deal = Awaited<ReturnType<typeof listDealsForAddress>>[number];

/// What each deal was for, by deal id, lower-cased. Callers that have already
/// read someone's deals pass them here instead of reading them again.
export const termsOf = (deals: Pick<Deal, 'jobId' | 'terms'>[]): Map<string, string> =>
  new Map(deals.map((d) => [d.jobId.toLowerCase(), d.terms ?? '']));

async function dealTerms(address: string): Promise<Map<string, string>> {
  return termsOf(await listDealsForAddress(address).catch(() => []));
}

/// Someone's rating with their rating for the work asked about (view 93).
/// No request words: exactly their public rating.
export async function loadRatingForWork(
  address: string,
  request: string[],
  now = Date.now(),
  terms: (address: string) => Promise<Map<string, string>> = dealTerms,
): Promise<PublicRating> {
  if (request.length === 0) return loadPublicRating(address, now);
  const revealed = await revealedFor(address, now);
  if (revealed.length === 0) return { kind: 'new', count: 0 };
  return ratingForWork(revealed, await terms(address).catch(() => new Map<string, string>()), request, now);
}
