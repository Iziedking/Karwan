import { topicalOverlap } from '../llm/keywords.js';

/// Most pairs the LLM judges for one new request or one new offer. Without a
/// cap every request paid one model call per open offer, which grows with the
/// whole market.
export const MATCH_CANDIDATE_LIMIT = 20;

type RequestText = { keywords?: string[]; briefText?: string };
type OfferText = { title: string; description: string };

function requestTags(request: RequestText): string[] {
  if (request.keywords && request.keywords.length > 0) return request.keywords;
  return request.briefText ? [request.briefText] : [];
}

function topByOverlap<T>(items: readonly T[], score: (item: T) => number): T[] {
  return items
    .map((item) => ({ item, overlap: score(item) }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, MATCH_CANDIDATE_LIMIT)
    .map((entry) => entry.item);
}

/// The open offers worth asking the matcher about for one request: only those
/// sharing a topic word with it, best overlap first.
export function rankListingCandidates<L extends OfferText>(request: RequestText, listings: readonly L[]): L[] {
  const tags = requestTags(request);
  return topByOverlap(listings, (listing) => topicalOverlap(tags, [listing.title, listing.description]));
}

/// The open requests worth asking the matcher about for one new offer.
export function rankRequestCandidates<J extends RequestText>(listing: OfferText, requests: readonly J[]): J[] {
  return topByOverlap(requests, (request) => topicalOverlap(requestTags(request), [listing.title, listing.description]));
}
