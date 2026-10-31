import type { ShortlistEntry } from '@/core/api';

type Reason = ShortlistEntry['reasons'][number];
export type RankedOffer = ShortlistEntry & { bestFit: boolean; reasonLine: Reason[] };

/// The offers on a request in the agent's rank order (view 44, P4). The best
/// fit is the first offer the agent recommends that is inside the request and
/// still available; its reasons lead with the skill match, at most three.
export function rankedOffers(entries: ShortlistEntry[]): RankedOffer[] {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const best = sorted.find((e) => e.recommended && !e.outsideRequest && e.state !== 'unavailable');
  return sorted.map((e) => ({
    ...e,
    bestFit: e === best,
    reasonLine: [...e.reasons].sort((a, b) => Number(b === 'best_fit') - Number(a === 'best_fit')).slice(0, 3),
  }));
}
