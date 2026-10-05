import { topicalMatchScore } from '../llm/keywords.js';

/// How well a seller's own offers cover a request, 0-100: the best single offer,
/// scored on its title and description with the same coverage measure as profile
/// skills. A seller who wrote an offer for exactly this work should rank as the
/// skill fit it is, even when their profile skills were written for other work.
export function offerTopicalMatch(
  briefKeywords: string[],
  offers: ReadonlyArray<{ title: string; description: string }>,
): number {
  let best = 0;
  for (const offer of offers) {
    best = Math.max(best, topicalMatchScore(briefKeywords, [offer.title, offer.description]));
  }
  return best;
}
