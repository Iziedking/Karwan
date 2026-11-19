import { topicalMatchScore } from '../llm/keywords.js';
import { publicRating, type DealRating, type PublicRating } from './rules.js';

/// A rating for the work asked about (view 93). Each rating counts by how
/// closely its deal's words match the request and by how recent it is; the
/// overall rating fills in while close ratings are few.

const YEAR_MS = 365 * 86_400_000;
/// How many close ratings the overall rating is worth while they build up.
const OVERALL_WEIGHT = 3;
/// A deal at least this close to the request counts as "like this".
const LIKE_THIS = 0.5;

export function ratingForWork(revealed: DealRating[], termsByDeal: Map<string, string>, request: string[], now: number): PublicRating {
  const plain = publicRating(revealed);
  if (plain.kind !== 'rated' || request.length === 0) return plain;

  let weight = 0;
  let sum = 0;
  let closeWeight = 0;
  let closeSum = 0;
  let count = 0;
  for (const r of revealed) {
    const recency = 0.5 ** (Math.max(0, now - r.settledAt) / YEAR_MS);
    const terms = termsByDeal.get(r.dealId.toLowerCase()) ?? termsByDeal.get(r.dealId) ?? '';
    const match = terms ? topicalMatchScore(request, [terms]) / 100 : 0;
    weight += recency;
    sum += recency * r.stars;
    closeWeight += match * recency;
    closeSum += match * recency * r.stars;
    if (match >= LIKE_THIS) count += 1;
  }
  const overall = sum / weight;
  const rank = (closeSum + OVERALL_WEIGHT * overall) / (closeWeight + OVERALL_WEIGHT);
  return { ...plain, forWork: { value: Math.round(rank * 10) / 10, count, rank } };
}
